import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'approval_helpers.dart';

final Map<String, List<Map<String, dynamic>>> _approvalRowsCache = {};
final Map<String, Future<List<Map<String, dynamic>>>> _approvalRowsInFlight = {};
const _approvalDiskCachePrefix = 'ceo_approval_review_rows_v2';

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
  _approvalRowsInFlight.clear();
}

Future<List<Map<String, dynamic>>> loadCachedApprovalReviewRowsFromDisk({
  required String filter,
  required int limit,
}) async {
  final key = _cacheKey(normalizeReviewStatus(filter), limit);
  final memoryRows = cachedApprovalReviewRows(filter: filter, limit: limit);
  if (memoryRows.isNotEmpty) return memoryRows;
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_approvalDiskCachePrefix:$key');
    if (raw == null || raw.trim().isEmpty) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    final rows = decoded
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
    if (rows.isNotEmpty) {
      _approvalRowsCache[key] = rows;
    }
    return rows;
  } catch (_) {
    return const [];
  }
}

Future<void> _saveApprovalRowsToDisk(
  String filter,
  int limit,
  List<Map<String, dynamic>> rows,
) async {
  if (rows.isEmpty) return;
  try {
    final key = _cacheKey(normalizeReviewStatus(filter), limit);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_approvalDiskCachePrefix:$key', jsonEncode(rows));
  } catch (_) {
    // Cache is a speed/stability layer only; never block approval loading.
  }
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

/// Safe select helper with short 5-second timeout.
Future<List<Map<String, dynamic>>> _safeSelectRows(
  Future<dynamic> Function() loader, {
  Duration timeout = const Duration(seconds: 5),
}) async {
  try {
    final data = await loader().timeout(timeout);
    if (data == null) return const [];
    return List<Map<String, dynamic>>.from(data as Iterable);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

/// Load appeal rows from Supabase (one direct query, no cascade fallback).
Future<List<Map<String, dynamic>>> _loadAppealRows(
  SupabaseClient supabase,
  String filter,
  int limit,
) async {
  return _safeSelectRows(
    () => supabase
        .from('appeals')
        .select(
          'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id,reason',
        )
        .eq('status', normalizeReviewStatus(filter))
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
}

/// Load daily entry rows from Supabase.
Future<List<Map<String, dynamic>>> _loadDailyEntryRows(
  SupabaseClient supabase,
  int limit,
) async {
  return _safeSelectRows(
    () => supabase
        .from('daily_entries')
        .select(
          'id,entry_id,date,type,amount,town_name,review_status,created_at,description,category,account_type',
        )
        .order('created_at', ascending: false)
        .limit(limit * 3),
  );
}

/// Load via RPC (preferred — single round-trip).
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
    timeout: const Duration(seconds: 5),
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
  final key = _cacheKey(activeFilter, limit);

  // Return in-flight future if already fetching same data.
  final existing = _approvalRowsInFlight[key];
  if (existing != null) return existing;

  final future = _loadApprovalReviewRowsUncached(
    supabase,
    filter: activeFilter,
    limit: limit,
  ).whenComplete(() => _approvalRowsInFlight.remove(key));
  _approvalRowsInFlight[key] = future;
  return future;
}

Future<List<Map<String, dynamic>>> _loadApprovalReviewRowsUncached(
  SupabaseClient supabase, {
  required String filter,
  required int limit,
}) async {
  final activeFilter = normalizeReviewStatus(filter);

  // ── KEY FIX: Run RPC + direct appeals + direct daily_entries ALL IN PARALLEL ──
  // Previously: sequential fallbacks → 8s + 8s + 8s = up to 24s of skeletons.
  // Now: all 3 fire at once, we use whichever returns fastest & has data.
  final results = await Future.wait<List<Map<String, dynamic>>>([
    _loadRpcReviewRows(supabase, activeFilter, limit),
    _loadAppealRows(supabase, activeFilter, limit),
    _loadDailyEntryRows(supabase, limit),
  ]);

  final rpcRows = results[0];
  final appealRows = results[1];
  final entryRows = results[2];

  // Prefer RPC result (most efficient, joined view).
  if (rpcRows.isNotEmpty) {
    final clean = _finalizeReviewRows(rpcRows, activeFilter, limit);
    if (clean.isNotEmpty) {
      _approvalRowsCache[_cacheKey(activeFilter, limit)] = clean;
      unawaited(_saveApprovalRowsToDisk(activeFilter, limit, clean));
      return clean;
    }
  }

  // Fallback: merge appeals + daily entries directly.
  final mergedRows = _finalizeReviewRows([
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

  if (mergedRows.isNotEmpty) {
    _approvalRowsCache[_cacheKey(activeFilter, limit)] = mergedRows;
    unawaited(_saveApprovalRowsToDisk(activeFilter, limit, mergedRows));
    return mergedRows;
  }

  // Last resort: return disk cache if network failed entirely.
  final cached = cachedApprovalReviewRows(filter: activeFilter, limit: limit);
  if (cached.isNotEmpty) return cached;
  return loadCachedApprovalReviewRowsFromDisk(
    filter: activeFilter,
    limit: limit,
  );
}
