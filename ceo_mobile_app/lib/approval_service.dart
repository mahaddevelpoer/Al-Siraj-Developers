import 'package:supabase_flutter/supabase_flutter.dart';

import 'approval_helpers.dart';

String normalizeReviewStatus(dynamic status) {
  final clean = '${status ?? 'pending'}'.trim().toLowerCase();
  if (clean == 'approved' || clean == 'rejected') return clean;
  return 'pending';
}

DateTime _dateOf(Map<String, dynamic> row) {
  final value = row['created_at'] ??
      row['date'] ??
      row['Date'] ??
      row['requested_data']?['date'];
  return DateTime.tryParse('$value') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

Future<List<Map<String, dynamic>>> _safeSelectRows(
  Future<dynamic> Function() loader, {
  Duration timeout = const Duration(seconds: 3),
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
  String status,
) async {
  final rows = await _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .eq('status', status)
        .order('created_at', ascending: false)
        .limit(limit),
  );
  if (rows.isNotEmpty) return rows;
  return _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .limit(limit * 2),
  );
}

Future<List<Map<String, dynamic>>> _loadDailyEntryRows(
  SupabaseClient supabase,
  int limit,
  String status,
) async {
  final rows = await _safeSelectRows(
    () => supabase
        .from('daily_entries')
        .select(
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type,time',
        )
        .eq('review_status', status)
        .order('created_at', ascending: false)
        .limit(limit),
  );
  if (rows.isNotEmpty) return rows;
  return _safeSelectRows(
    () => supabase
        .from('daily_entries')
        .select(
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type,time',
        )
        .limit(limit * 2),
  );
}

Future<List<Map<String, dynamic>>> loadApprovalReviewRows(
  SupabaseClient supabase, {
  required String filter,
  required int limit,
}) async {
  final activeFilter = normalizeReviewStatus(filter);
  final appealRows = await _loadAppealRows(supabase, limit, activeFilter);
  final entryRows = await _loadDailyEntryRows(supabase, limit, activeFilter);

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
  return rows.where((row) {
    final prefix = isDailyReviewItem(row) ? 'entry' : 'appeal';
    return seen.add(
      '$prefix-${row['id'] ?? row['entry_id'] ?? safeRowValue(row, 'Entry_ID')}',
    );
  }).take(limit).toList();
}
