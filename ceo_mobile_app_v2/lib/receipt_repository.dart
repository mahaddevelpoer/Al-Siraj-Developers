import 'dart:async';
import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ReceiptLoadBundle {
  const ReceiptLoadBundle({
    required this.entryRows,
    required this.townRows,
    required this.mediaRows,
    required this.source,
  });

  final List<Map<String, dynamic>> entryRows;
  final List<Map<String, dynamic>> townRows;
  final List<Map<String, dynamic>> mediaRows;
  final String source;
}

final Map<String, ReceiptLoadBundle> _receiptCache = {};
final Map<String, Future<ReceiptLoadBundle>> _receiptInFlight = {};
const _receiptDiskCachePrefix = 'ceo_receipt_bundle_v1';

dynamic receiptRowValue(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
  return row[key] ?? row[lower];
}

String _dayKey(DateTime date) => DateFormat('yyyy-MM-dd').format(date);
String _cacheKey(DateTime date, String? initialTown) =>
    '${_dayKey(date)}:${initialTown ?? '*'}';

bool _hasReceiptData(ReceiptLoadBundle bundle) {
  return bundle.entryRows.isNotEmpty ||
      bundle.townRows.isNotEmpty ||
      bundle.mediaRows.isNotEmpty;
}

bool _activeTownRow(Map<String, dynamic> row) {
  final deletedAt =
      '${receiptRowValue(row, 'Deleted_At') ?? row['deleted_at'] ?? ''}'.trim();
  final status =
      '${receiptRowValue(row, 'Status') ?? row['status'] ?? 'Active'}'
          .trim()
          .toLowerCase();
  final notDeleted = deletedAt.isEmpty || deletedAt.toLowerCase() == 'null';
  return notDeleted &&
      status != 'deleted' &&
      status != 'inactive' &&
      status != 'archived';
}

Future<List<Map<String, dynamic>>> _safeRows(
  Future<dynamic> Function() loader, {
  Duration timeout = const Duration(seconds: 7),
}) async {
  try {
    final data = await loader().timeout(timeout);
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

Future<ReceiptLoadBundle?> _loadReceiptBundleFromDisk(
  DateTime date,
  String? initialTown,
) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(
      '$_receiptDiskCachePrefix:${_cacheKey(date, initialTown)}',
    );
    if (raw == null || raw.trim().isEmpty) return null;
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return null;
    List<Map<String, dynamic>> rows(String key) {
      final value = decoded[key];
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
    }

    return ReceiptLoadBundle(
      entryRows: rows('entryRows'),
      townRows: rows('townRows'),
      mediaRows: rows('mediaRows'),
      source: '${decoded['source'] ?? 'disk'}',
    );
  } catch (_) {
    return null;
  }
}

Future<void> _saveReceiptBundleToDisk(
  DateTime date,
  String? initialTown,
  ReceiptLoadBundle bundle,
) async {
  if (!_hasReceiptData(bundle)) return;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_receiptDiskCachePrefix:${_cacheKey(date, initialTown)}',
      jsonEncode({
        'entryRows': bundle.entryRows,
        'townRows': bundle.townRows,
        'mediaRows': bundle.mediaRows,
        'source': bundle.source,
      }),
    );
  } catch (_) {
    // Receipt cache is best effort and must not affect report loading.
  }
}

Future<List<Map<String, dynamic>>> loadReceiptMediaRows(
  SupabaseClient supabase, {
  required DateTime date,
}) {
  final day = _dayKey(date);
  return _safeRows(
    () => supabase
        .from('media_library')
        .select('*')
        .eq('type', 'daily_ledger_receipt')
        .eq('report_date', day)
        .order('created_at', ascending: false),
  );
}

Future<List<Map<String, dynamic>>> _loadRpcRows(
  SupabaseClient supabase, {
  required DateTime date,
}) {
  return _safeRows(
    () => supabase.rpc(
      'ceo_mobile_daily_receipt_rows',
      params: {'p_report_date': _dayKey(date)},
    ),
    timeout: const Duration(seconds: 6),
  );
}

Future<ReceiptLoadBundle> loadReceiptBundle(
  SupabaseClient supabase, {
  required DateTime date,
  String? initialTown,
}) async {
  final cacheKey = _cacheKey(date, initialTown);
  final existing = _receiptInFlight[cacheKey];
  if (existing != null) return existing;
  final future = _loadReceiptBundleUncached(
    supabase,
    date: date,
    initialTown: initialTown,
  ).whenComplete(() => _receiptInFlight.remove(cacheKey));
  _receiptInFlight[cacheKey] = future;
  return future;
}

Future<ReceiptLoadBundle> _loadReceiptBundleUncached(
  SupabaseClient supabase, {
  required DateTime date,
  String? initialTown,
}) async {
  final day = _dayKey(date);
  final cacheKey = _cacheKey(date, initialTown);
  final diskBundle = await _loadReceiptBundleFromDisk(date, initialTown);
  final mediaFuture = loadReceiptMediaRows(supabase, date: date);
  final rpcRows = await _loadRpcRows(supabase, date: date);
  final mediaRows = await mediaFuture;

  if (rpcRows.isNotEmpty) {
    final townRows = rpcRows
        .map((row) => {
              'Town_Name': receiptRowValue(row, 'Town_Name') ?? row['town_name'],
              'Status': 'Active',
            })
        .toList();
    final bundle = ReceiptLoadBundle(
      entryRows: rpcRows,
      townRows: townRows,
      mediaRows: mediaRows,
      source: 'rpc',
    );
    _receiptCache[cacheKey] = bundle;
    unawaited(_saveReceiptBundleToDisk(date, initialTown, bundle));
    return bundle;
  }

  final direct = await Future.wait<List<Map<String, dynamic>>>([
    _safeRows(
      () => supabase
          .from('daily_entries')
          .select('*')
          .order('created_at', ascending: false),
    ),
    _safeRows(
      () => supabase.from('ceo_mobile_active_towns').select('*'),
    ).then((rows) async {
      if (rows.isNotEmpty) return rows;
      return _safeRows(() => supabase.from('towns').select('*'));
    }),
  ]);
  final townRows = direct[1].where(_activeTownRow).toList();
  final activeTownNames = townRows
      .map((town) => '${receiptRowValue(town, 'Town_Name')}'.trim())
      .where((town) => town.isNotEmpty && town != 'null')
      .toSet();
  final entryRows = direct[0].where((row) {
    final status =
        '${receiptRowValue(row, 'Review_Status') ?? row['review_status'] ?? 'approved'}'
            .trim()
            .toLowerCase();
    final town = '${receiptRowValue(row, 'Town_Name')}'.trim();
    return '${receiptRowValue(row, 'Date')}'.startsWith(day) &&
        status != 'pending' &&
        status != 'rejected' &&
        (activeTownNames.isEmpty || activeTownNames.contains(town));
  }).toList();

  final bundle = ReceiptLoadBundle(
    entryRows: entryRows,
    townRows: townRows,
    mediaRows: mediaRows,
    source: 'direct',
  );
  if (entryRows.isNotEmpty || mediaRows.isNotEmpty) {
    _receiptCache[cacheKey] = bundle;
    unawaited(_saveReceiptBundleToDisk(date, initialTown, bundle));
    return bundle;
  }
  return _receiptCache[cacheKey] ?? diskBundle ?? bundle;
}
