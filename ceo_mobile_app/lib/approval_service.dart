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
  String filter,
  int limit,
) async {
  final rows = await _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .eq('status', normalizeReviewStatus(filter))
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
  if (rows.isNotEmpty) return rows;
  final rawStatusRows = await _safeSelectRows(
    () => supabase
        .from('appeals')
        .select('*')
        .eq('status', normalizeReviewStatus(filter))
        .limit(limit * 3),
  );
  if (rawStatusRows.isNotEmpty) return rawStatusRows;
  return _safeSelectRows(
    () => supabase.from('appeals').select('*').limit(limit * 3),
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
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type',
        )
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
  if (rows.isNotEmpty) return rows;
  return _safeSelectRows(
    () => supabase.from('daily_entries').select('*').limit(limit * 3),
  );
}

Future<List<Map<String, dynamic>>> _loadRpcReviewRows(
  SupabaseClient supabase,
  String filter,
  int limit,
) async {
  return _safeSelectRows(
    () => supabase.rpc(
      'ceo_mobile_review_inbox',
      params: {
        'p_status': normalizeReviewStatus(filter),
        'p_limit': limit,
      },
    ),
    timeout: const Duration(seconds: 8),
  );
}

List<Map<String, dynamic>> _finalizeReviewRows(
  Iterable<Map<String, dynamic>> sourceRows,
  String activeFilter,
  int limit,
) {
  final rows = sourceRows
      .map((row) {
        final kind = '${row['_review_kind'] ?? row['review_kind'] ?? ''}';
        if (kind == ReviewItemKind.dailyEntry.name) {
          return {
            ...normalizeDailyEntryReviewRow(row),
            'status': normalizeReviewStatus(
              row['review_status'] ??
                  row['status'] ??
                  safeRowValue(row, 'Review_Status'),
            ),
          };
        }
        return {
          ...normalizeAppealReviewRow(row),
          'status': normalizeReviewStatus(row['status']),
        };
      })
      .where((row) => row['status'] == activeFilter)
      .toList();

  final seen = <String>{};
  rows.sort((a, b) => _dateOf(b).compareTo(_dateOf(a)));
  return rows.where((row) {
    final prefix = isDailyReviewItem(row) ? 'entry' : 'appeal';
    return seen.add(
      '$prefix-${row['id'] ?? row['entry_id'] ?? safeRowValue(row, 'Entry_ID')}',
    );
  }).take(limit).toList();
}

Future<List<Map<String, dynamic>>> loadApprovalReviewRows(
  SupabaseClient supabase, {
  required String filter,
  required int limit,
}) async {
  final activeFilter = normalizeReviewStatus(filter);
  final cached = cachedApprovalReviewRows(filter: activeFilter, limit: limit);
  final rpcRows = await _loadRpcReviewRows(supabase, activeFilter, limit);
  final rpcCleanRows = _finalizeReviewRows(rpcRows, activeFilter, limit);
  if (rpcCleanRows.isNotEmpty) {
    _approvalRowsCache[_cacheKey(activeFilter, limit)] = rpcCleanRows;
    return rpcCleanRows;
  }

  final results = await Future.wait<List<Map<String, dynamic>>>([
    _loadAppealRows(supabase, activeFilter, limit).timeout(
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

  final cleanRows = _finalizeReviewRows([
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
  ], activeFilter, limit);
  if (cleanRows.isNotEmpty) {
    _approvalRowsCache[_cacheKey(activeFilter, limit)] = cleanRows;
    return cleanRows;
  }
  return cached;
}
