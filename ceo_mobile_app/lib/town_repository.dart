import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TownPulse {
  const TownPulse({
    required this.name,
    this.accountantName = '',
    this.totalReceived = 0,
    this.totalExpenses = 0,
    this.cashBalance = 0,
    this.pendingAppeals = 0,
    this.pendingCollection = 0,
    this.todayIncome = 0,
    this.todayExpense = 0,
    this.salesCount = 0,
  });

  final String name;
  final String accountantName;
  final num totalReceived;
  final num totalExpenses;
  final num cashBalance;
  final num pendingAppeals;
  final num pendingCollection;
  final num todayIncome;
  final num todayExpense;
  final int salesCount;
}

class OperatorPresence {
  const OperatorPresence({
    required this.id,
    required this.name,
    required this.role,
    required this.townName,
    required this.isOnline,
    this.lastSeenAt,
    this.deviceLabel = '',
    this.activeContext = '',
  });

  final String id;
  final String name;
  final String role;
  final String townName;
  final bool isOnline;
  final DateTime? lastSeenAt;
  final String deviceLabel;
  final String activeContext;
}

class ActivityRows {
  const ActivityRows({
    required this.sales,
    required this.entries,
    required this.expenses,
  });

  final List<Map<String, dynamic>> sales;
  final List<Map<String, dynamic>> entries;
  final List<Map<String, dynamic>> expenses;
}

Future<List<TownPulse>>? _townPulseRowsInFlight;
Future<List<OperatorPresence>>? _operatorPresenceRowsInFlight;
Future<List<Map<String, dynamic>>>? _activeTownRowsInFlight;
Future<ActivityRows>? _activityRowsInFlight;

Future<List<Map<String, dynamic>>> resilientSelectRows(
  Future<dynamic> Function() primary,
  Future<dynamic> Function() fallback,
) async {
  try {
    return List<Map<String, dynamic>>.from(await primary());
  } catch (_) {
    return List<Map<String, dynamic>>.from(await fallback());
  }
}

Future<List<TownPulse>> loadTownPulseRows(SupabaseClient client) async {
  final existing = _townPulseRowsInFlight;
  if (existing != null) return existing;
  final future = _loadTownPulseRowsUncached(
    client,
  ).whenComplete(() => _townPulseRowsInFlight = null);
  _townPulseRowsInFlight = future;
  return future;
}

Future<List<TownPulse>> _loadTownPulseRowsUncached(SupabaseClient client) async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final results = await Future.wait<List<Map<String, dynamic>>>([
    resilientSelectRows(
      () => client
          .from('towns')
          .select('town_name,status,deleted_at')
          .order('town_name'),
      () => client.from('towns').select('*').order('town_name'),
    ),
    resilientSelectRows(
      () => client
          .from('appeals')
          .select(
            'id,status,town_name,requested_data,requested_by_user_id(full_name,email,town_name,town_id)',
          )
          .eq('status', 'pending'),
      () => client.from('appeals').select('*').eq('status', 'pending'),
    ),
    resilientSelectRows(
      () => client
          .from('daily_entries')
          .select(
            'id,entry_id,date,type,amount,town_name,review_status,created_at',
          ),
      () => client.from('daily_entries').select('*'),
    ),
    resilientSelectRows(
      () => client
          .from('all_sales')
          .select(
            'id,sale_id,type,plot_shop_number,town_name,customer_name,received_amount,advance_amount_pkr,remaining_amount,created_at',
          ),
      () => client.from('all_sales').select('*'),
    ),
    resilientSelectRows(
      () => client
          .from('users')
          .select('full_name,town_name,town_id,role')
          .eq('role', 'accountant'),
      () => client.from('users').select('*').eq('role', 'accountant'),
    ),
  ]);

  final towns = results[0].where(isActiveTownRow).toList();
  final appeals = results[1];
  final entries = results[2];
  final sales = results[3];
  final accountants = results[4];

  final names = <String>{
    ...towns.map((town) => '${rowValue(town, 'Town_Name')}'.trim()),
  }..removeWhere((name) => name.isEmpty || name == 'null');

  return names.map((townName) {
    final townEntries = entries
        .where((entry) => '${rowValue(entry, 'Town_Name')}'.trim() == townName)
        .toList();
    final todayEntries = townEntries
        .where((entry) => '${rowValue(entry, 'Date')}'.startsWith(today))
        .toList();
    final townSales = sales
        .where((sale) => '${rowValue(sale, 'Town_Name')}'.trim() == townName)
        .toList();
    final pendingAppeals = appeals
        .where((appeal) => appealTownName(appeal).trim() == townName)
        .length;
    final accountant = accountants.firstWhere(
      (accountant) =>
          '${rowValue(accountant, 'Town_Name')}'.trim() == townName ||
          '${accountant['town_id'] ?? ''}'.trim() == townName,
      orElse: () => const <String, dynamic>{},
    );
    final totalIncome = townEntries
        .where((entry) => '${rowValue(entry, 'Type')}'.toLowerCase() == 'income')
        .fold<num>(0, (sum, entry) => sum + asNumber(rowValue(entry, 'Amount')));
    final totalExpense = townEntries
        .where((entry) => '${rowValue(entry, 'Type')}'.toLowerCase() == 'expense')
        .fold<num>(0, (sum, entry) => sum + asNumber(rowValue(entry, 'Amount')));
    final saleReceived = townSales.fold<num>(
      0,
      (sum, sale) =>
          sum +
          (asNumber(rowValue(sale, 'Received_Amount')) == 0
              ? asNumber(rowValue(sale, 'Advance_Amount_PKR'))
              : asNumber(rowValue(sale, 'Received_Amount'))),
    );
    final pendingCollection = townSales.fold<num>(
      0,
      (sum, sale) => sum + asNumber(rowValue(sale, 'Remaining_Amount')),
    );
    final todayIncome = todayEntries
        .where((entry) => '${rowValue(entry, 'Type')}'.toLowerCase() == 'income')
        .fold<num>(0, (sum, entry) => sum + asNumber(rowValue(entry, 'Amount')));
    final todayExpense = todayEntries
        .where((entry) => '${rowValue(entry, 'Type')}'.toLowerCase() == 'expense')
        .fold<num>(0, (sum, entry) => sum + asNumber(rowValue(entry, 'Amount')));

    final totalReceived = totalIncome + saleReceived;
    final totalExpenses = totalExpense;
    return TownPulse(
      name: townName,
      accountantName: '${accountant['full_name'] ?? ''}'.trim(),
      totalReceived: totalReceived,
      totalExpenses: totalExpenses,
      cashBalance: totalReceived - totalExpenses,
      pendingAppeals: pendingAppeals,
      pendingCollection: pendingCollection,
      todayIncome: todayIncome,
      todayExpense: todayExpense,
      salesCount: townSales.length,
    );
  }).toList()
    ..sort((a, b) => a.name.compareTo(b.name));
}

Future<List<OperatorPresence>> loadOperatorPresenceRows(
  SupabaseClient client,
) async {
  final existing = _operatorPresenceRowsInFlight;
  if (existing != null) return existing;
  final future = _loadOperatorPresenceRowsUncached(
    client,
  ).whenComplete(() => _operatorPresenceRowsInFlight = null);
  _operatorPresenceRowsInFlight = future;
  return future;
}

Future<List<OperatorPresence>> _loadOperatorPresenceRowsUncached(
  SupabaseClient client,
) async {
  List<Map<String, dynamic>> rows;
  try {
    rows = List<Map<String, dynamic>>.from(
      await client
          .from('users')
          .select(
            'id,email,full_name,role,town_name,town_id,online_status,last_seen_at,device_label,last_active_context',
          ),
    );
  } catch (_) {
    rows = List<Map<String, dynamic>>.from(
      await client.from('users').select('id,email,full_name,role,town_name,town_id'),
    );
  }

  final now = DateTime.now().toUtc();
  return rows
      .where((row) {
        final role = '${row['role'] ?? ''}'.toLowerCase();
        return role == 'ceo' || role == 'accountant';
      })
      .map((row) {
        final lastSeen = parseDateTime(row['last_seen_at']);
        final status = '${row['online_status'] ?? ''}'.toLowerCase();
        final recent = lastSeen != null &&
            now.difference(lastSeen.toUtc()) <= const Duration(seconds: 90);
        final name = '${row['full_name'] ?? row['email'] ?? 'Unknown user'}'.trim();
        final townName = '${row['town_name'] ?? row['town_id'] ?? 'All towns'}'.trim();
        return OperatorPresence(
          id: '${row['id'] ?? row['email'] ?? name}',
          name: name.isEmpty ? 'Unknown user' : name,
          role: '${row['role'] ?? 'user'}'.trim(),
          townName: townName.isEmpty || townName == 'null' ? 'All towns' : townName,
          isOnline: status == 'online' && recent,
          lastSeenAt: lastSeen,
          deviceLabel: '${row['device_label'] ?? ''}'.trim(),
          activeContext: '${row['last_active_context'] ?? ''}'.trim(),
        );
      })
      .toList()
    ..sort((a, b) {
      if (a.isOnline != b.isOnline) return a.isOnline ? -1 : 1;
      return a.townName.compareTo(b.townName);
    });
}

Future<List<Map<String, dynamic>>> loadActiveTownRows(
  SupabaseClient client,
) async {
  final existing = _activeTownRowsInFlight;
  if (existing != null) return existing;
  final future = _loadActiveTownRowsUncached(
    client,
  ).whenComplete(() => _activeTownRowsInFlight = null);
  _activeTownRowsInFlight = future;
  return future;
}

Future<List<Map<String, dynamic>>> _loadActiveTownRowsUncached(
  SupabaseClient client,
) async {
  final data = await client.from('towns').select('*').order('town_name');
  return List<Map<String, dynamic>>.from(data).where(isActiveTownRow).toList();
}

Future<ActivityRows> loadActivityRows(SupabaseClient client) async {
  final existing = _activityRowsInFlight;
  if (existing != null) return existing;
  final future = _loadActivityRowsUncached(
    client,
  ).whenComplete(() => _activityRowsInFlight = null);
  _activityRowsInFlight = future;
  return future;
}

Future<ActivityRows> _loadActivityRowsUncached(SupabaseClient client) async {
  final results = await Future.wait<dynamic>([
    client.from('all_sales').select('*').order('created_at', ascending: false).limit(40),
    client.from('daily_entries').select('*').order('date', ascending: false).limit(40),
    client.from('expenses').select('*').order('date', ascending: false).limit(40),
  ]);
  return ActivityRows(
    sales: List<Map<String, dynamic>>.from(results[0]),
    entries: List<Map<String, dynamic>>.from(results[1]),
    expenses: List<Map<String, dynamic>>.from(results[2]),
  );
}

dynamic rowValue(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (match) => '${match[1]}_${match[2]}')
      .toLowerCase();
  return row[key] ?? row[lower];
}

num asNumber(dynamic value) {
  if (value is num) return value;
  return num.tryParse('$value'.replaceAll(',', '')) ?? 0;
}

bool isActiveTownRow(Map<String, dynamic> row) {
  final deletedAt = '${rowValue(row, 'Deleted_At') ?? row['deleted_at'] ?? ''}'.trim();
  if (deletedAt.isNotEmpty && deletedAt.toLowerCase() != 'null') return false;
  final status = '${rowValue(row, 'Status') ?? row['status'] ?? 'Active'}'
      .trim()
      .toLowerCase();
  return status != 'deleted' && status != 'inactive' && status != 'archived';
}

String appealTownName(Map<String, dynamic> appeal) {
  final data = mapFromAny(appeal['requested_data']);
  final user = mapFromAny(appeal['requested_by_user_id']);
  return '${data['townName'] ?? data['Town_Name'] ?? data['town_name'] ?? data['town'] ?? data['Town'] ?? appeal['town_name'] ?? user['agent_town'] ?? user['agent_towns'] ?? ''}'
      .trim();
}

Map<String, dynamic> mapFromAny(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty) return mapFromAny(value.first);
  if (value is String && value.trim().isNotEmpty) {
    try {
      return mapFromAny(jsonDecode(value));
    } catch (_) {
      return const {};
    }
  }
  return const {};
}

DateTime? parseDateTime(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse('$value');
}
