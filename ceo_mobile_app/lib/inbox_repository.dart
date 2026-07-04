import 'package:intl/intl.dart';
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

Future<CeoInboxRows> loadCeoInboxRows(
  SupabaseClient supabase, {
  DateTime? date,
  int limit = 40,
}) async {
  final cacheKey =
      '${DateFormat('yyyy-MM-dd').format(date ?? DateTime.now())}:$limit';
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
  final rows = await loadCeoInboxRows(supabase, date: date, limit: 120);
  return rows.appeals.length +
      rows.dailyEntries.length +
      rows.notifications.length +
      rows.ledgerReceipts.length;
}
