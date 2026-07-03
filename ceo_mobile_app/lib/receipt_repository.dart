import 'package:intl/intl.dart';
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

dynamic receiptRowValue(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
  return row[key] ?? row[lower];
}

String _dayKey(DateTime date) => DateFormat('yyyy-MM-dd').format(date);

bool _activeTownRow(Map<String, dynamic> row) {
  final deletedAt =
      '${receiptRowValue(row, 'Deleted_At') ?? row['deleted_at'] ?? ''}'.trim();
  final status =
      '${receiptRowValue(row, 'Status') ?? row['status'] ?? 'Active'}'
          .trim()
          .toLowerCase();
  return deletedAt.isEmpty && status != 'deleted' && status != 'inactive';
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
  final day = _dayKey(date);
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
    _receiptCache['$day:${initialTown ?? '*'}'] = bundle;
    return bundle;
  }

  final direct = await Future.wait<List<Map<String, dynamic>>>([
    _safeRows(
      () => supabase
          .from('daily_entries')
          .select('*')
          .order('created_at', ascending: false),
    ),
    _safeRows(() => supabase.from('towns').select('*')),
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
  final cacheKey = '$day:${initialTown ?? '*'}';
  if (entryRows.isNotEmpty || mediaRows.isNotEmpty) {
    _receiptCache[cacheKey] = bundle;
    return bundle;
  }
  return _receiptCache[cacheKey] ?? bundle;
}
