import 'package:supabase_flutter/supabase_flutter.dart';

import 'approval_helpers.dart';

final Map<String, List<Map<String, dynamic>>> _approvalRowsCache = {};

String normalizeReviewStatus(dynamic status) {
  final clean = '${status ?? 'pending'}'.trim().toLowerCase();
  if (clean == 'approved' || clean == 'rejected') return clean;
  return 'pending';
}

String _cacheKey(String filter, int limit) =>
    '${normalizeReviewStatus(filter)}:$limit';

List<Map<String, dynamic>> cachedApprovalReviewRows({
  required String filter,
  required int limit,
}) {
  return List<Map<String, dynamic>>.from(
    _approvalRowsCache[_cacheKey(filter, limit)] ?? const [],
  );
}

void clearApprovalReviewCache() {
  _approvalRowsCache.clear();
}

DateTime _dateOf(Map<String, dynamic> row) {
  final requestedData = safeMapFromAny(row['requested_data']);
  final value = row['created_at'] ??
      row['date'] ??
      row['Date'] ??
      requestedData['date'] ??
      requestedData['Date'];
  return DateTime.tryParse('$value') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

Future<List<Map<String, dynamic>>> _safeSelectRows(
  Future<dynamic> Function() loader, {
  Duration timeout = const Duration(seconds: 8),
}) async {
  try {
    final data = await loader().timeout(timeout);
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

Future<List<Map<String, dynamic>>> _loadAppealRows(
  SupabaseClient supabase,
  int limit,
) async {
  final rows = await _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
  if (rows.isNotEmpty) return rows;
  return _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .limit(limit * 3),
  );
}

Future<List<Map<String, dynamic>>> _loadDailyEntryRows(
  SupabaseClient supabase,
  int limit,
) async {
  final rows = await _safeSelectRows(
    () => supabase
        .from('daily_entries')
        .select(
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type,time',
        )
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
  if (rows.isNotEmpty) return rows;
  return _safeSelectRows(
    () => supabase
        .from('daily_entries')
        .select(
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type,time',
        )
        .limit(limit * 3),
  );
}

Future<List<Map<String, dynamic>>> loadApprovalReviewRows(
  SupabaseClient supabase, {
  required String filter,
  required int limit,
}) async {
  final activeFilter = normalizeReviewStatus(filter);
  final cached = cachedApprovalReviewRows(filter: activeFilter, limit: limit);
  final results = await Future.wait<List<Map<String, dynamic>>>([
    _loadAppealRows(supabase, limit).timeout(
      const Duration(seconds: 8),
      onTimeout: () => const <Map<String, dynamic>>[],
    ),
    _loadDailyEntryRows(supabase, limit).timeout(
      const Duration(seconds: 8),
      onTimeout: () => const <Map<String, dynamic>>[],
    ),
  ]);
  final appealRows = results[0];
  final entryRows = results[1];

  final rows = <Map<String, dynamic>>[
    ...appealRows.map(
      (row) => {
        ...normalizeAppealReviewRow(row),
        'status': normalizeReviewStatus(row['status']),
      },
    ),
    ...entryRows.map(
      (row) => {
        ...normalizeDailyEntryReviewRow(row),
        'status': normalizeReviewStatus(
          row['review_status'] ?? safeRowValue(row, 'Review_Status'),
        ),
      },
    ),
  ].where((row) => row['status'] == activeFilter).toList();

  final seen = <String>{};
  rows.sort((a, b) => _dateOf(b).compareTo(_dateOf(a)));
  final cleanRows = rows.where((row) {
    final prefix = isDailyReviewItem(row) ? 'entry' : 'appeal';
    return seen.add(
      '$prefix-${row['id'] ?? row['entry_id'] ?? safeRowValue(row, 'Entry_ID')}',
    );
  }).take(limit).toList();
  if (cleanRows.isNotEmpty) {
    _approvalRowsCache[_cacheKey(activeFilter, limit)] = cleanRows;
    return cleanRows;
  }
  return cached;
}
