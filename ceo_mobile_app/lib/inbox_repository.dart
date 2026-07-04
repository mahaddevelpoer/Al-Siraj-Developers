import 'dart:async';
import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CeoInboxRows {
  const CeoInboxRows({
    required this.appeals,
    required this.dailyEntries,
    required this.notifications,
    required this.ledgerReceipts,
  });

  final List<Map<String, dynamic>> appeals;
  final List<Map<String, dynamic>> dailyEntries;
  final List<Map<String, dynamic>> notifications;
  final List<Map<String, dynamic>> ledgerReceipts;
}

final Map<String, Future<CeoInboxRows>> _inboxRowsInFlight = {};
Future<int>? _badgeCountInFlight;
const _inboxDiskCachePrefix = 'ceo_inbox_rows_v1';

bool _hasAnyInboxRows(CeoInboxRows rows) {
  return rows.appeals.isNotEmpty ||
      rows.dailyEntries.isNotEmpty ||
      rows.notifications.isNotEmpty ||
      rows.ledgerReceipts.isNotEmpty;
}

Future<List<Map<String, dynamic>>> _safeRows(
  Future<dynamic> Function() loader, {
  Duration timeout = const Duration(seconds: 5),
}) async {
  try {
    final data = await loader().timeout(timeout);
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

String _inboxCacheKey(DateTime? date, int limit) {
  return '${DateFormat('yyyy-MM-dd').format(date ?? DateTime.now())}:$limit';
}

Future<CeoInboxRows?> loadCachedCeoInboxRowsFromDisk({
  DateTime? date,
  int limit = 40,
}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(
      '$_inboxDiskCachePrefix:${_inboxCacheKey(date, limit)}',
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

    return CeoInboxRows(
      appeals: rows('appeals'),
      dailyEntries: rows('dailyEntries'),
      notifications: rows('notifications'),
      ledgerReceipts: rows('ledgerReceipts'),
    );
  } catch (_) {
    return null;
  }
}

Future<void> _saveCeoInboxRowsToDisk(
  DateTime? date,
  int limit,
  CeoInboxRows rows,
) async {
  if (!_hasAnyInboxRows(rows)) return;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_inboxDiskCachePrefix:${_inboxCacheKey(date, limit)}',
      jsonEncode({
        'appeals': rows.appeals,
        'dailyEntries': rows.dailyEntries,
        'notifications': rows.notifications,
        'ledgerReceipts': rows.ledgerReceipts,
      }),
    );
  } catch (_) {
    // Disk cache is best effort and should never block inbox rendering.
  }
}

Future<CeoInboxRows> loadCeoInboxRows(
  SupabaseClient supabase, {
  DateTime? date,
  int limit = 40,
}) async {
  final cacheKey = _inboxCacheKey(date, limit);
  final existing = _inboxRowsInFlight[cacheKey];
  if (existing != null) return existing;
  final future = _loadCeoInboxRowsUncached(
    supabase,
    date: date,
    limit: limit,
  ).whenComplete(() => _inboxRowsInFlight.remove(cacheKey));
  _inboxRowsInFlight[cacheKey] = future;
  return future;
}

Future<CeoInboxRows> _loadCeoInboxRowsUncached(
  SupabaseClient supabase, {
  DateTime? date,
  int limit = 40,
}) async {
  final today = DateFormat('yyyy-MM-dd').format(date ?? DateTime.now());
  final results = await Future.wait<List<Map<String, dynamic>>>([
    _safeRows(
      () => supabase
          .from('appeals')
          .select(
            'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id(full_name,email,town_name)',
          )
          .eq('status', 'pending')
          .order('created_at', ascending: false)
          .limit(limit),
    ),
    _safeRows(
      () => supabase
          .from('daily_entries')
          .select('*')
          .eq('review_status', 'pending')
          .order('created_at', ascending: false)
          .limit(limit),
    ),
    _safeRows(
      () => supabase
          .from('notifications')
          .select('*')
          .eq('dismissed', 'No')
          .order('created_date', ascending: false)
          .limit(limit),
    ),
    _safeRows(
      () => supabase
          .from('media_library')
          .select(
            'id,type,report_date,town_name,title,created_at',
          )
          .eq('type', 'daily_ledger_receipt')
          .eq('report_date', today)
          .order('created_at', ascending: false)
          .limit(limit),
    ),
  ]);
  return CeoInboxRows(
    appeals: results[0],
    dailyEntries: results[1],
    notifications: results[2],
    ledgerReceipts: results[3],
  );
}

Future<CeoInboxRows> loadCeoInboxRowsWithDiskFallback(
  SupabaseClient supabase, {
  DateTime? date,
  int limit = 40,
}) async {
  final cached = await loadCachedCeoInboxRowsFromDisk(date: date, limit: limit);
  try {
    final rows = await loadCeoInboxRows(supabase, date: date, limit: limit);
    if (_hasAnyInboxRows(rows)) {
      unawaited(_saveCeoInboxRowsToDisk(date, limit, rows));
      return rows;
    }
    if (cached != null && _hasAnyInboxRows(cached)) return cached;
    return rows;
  } catch (_) {
    if (cached != null) return cached;
    rethrow;
  }
}

Future<CeoInboxRows> loadCeoInboxRowsAndPersist(
  SupabaseClient supabase, {
  DateTime? date,
  int limit = 40,
}) async {
  final rows = await loadCeoInboxRows(supabase, date: date, limit: limit);
  unawaited(_saveCeoInboxRowsToDisk(date, limit, rows));
  return rows;
}

Future<int> loadCeoInboxBadgeCount(
  SupabaseClient supabase, {
  DateTime? date,
}) async {
  if (_badgeCountInFlight != null) return _badgeCountInFlight!;
  final future = _loadCeoInboxBadgeCountUncached(
    supabase,
    date: date,
  ).whenComplete(() => _badgeCountInFlight = null);
  _badgeCountInFlight = future;
  return future;
}

Future<int> _loadCeoInboxBadgeCountUncached(
  SupabaseClient supabase, {
  DateTime? date,
}) async {
  final rows = await loadCeoInboxRowsWithDiskFallback(
    supabase,
    date: date,
    limit: 120,
  );
  return rows.appeals.length +
      rows.dailyEntries.length +
      rows.notifications.length +
      rows.ledgerReceipts.length;
}
