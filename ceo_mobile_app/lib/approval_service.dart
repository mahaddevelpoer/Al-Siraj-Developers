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
  Future<dynamic> Function() loader,
) async {
  try {
    final data = await loader();
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

Future<List<Map<String, dynamic>>> loadApprovalReviewRows(
  SupabaseClient supabase, {
  required String filter,
  required int limit,
}) async {
  final activeFilter = normalizeReviewStatus(filter);
  final results = await Future.wait<List<Map<String, dynamic>>>([
    _safeSelectRows(
      () => supabase
          .from('appeals')
          .select(
            'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
          )
          .eq('status', activeFilter)
          .order('created_at', ascending: false)
          .limit(limit)
          .timeout(const Duration(seconds: 8)),
    ),
    _safeSelectRows(
      () => supabase
          .from('daily_entries')
          .select('*')
          .eq('review_status', activeFilter)
          .order('created_at', ascending: false)
          .limit(limit)
          .timeout(const Duration(seconds: 8)),
    ),
  ]);

  final rows = <Map<String, dynamic>>[
    ...results[0].map(
      (row) => {
        ...normalizeAppealReviewRow(row),
        'status': normalizeReviewStatus(row['status']),
      },
    ),
    ...results[1].map(
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
  }).toList();
}
