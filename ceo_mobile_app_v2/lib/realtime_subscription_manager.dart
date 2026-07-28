import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

typedef RealtimeRefreshCallback = void Function();
typedef RealtimeStatusCallback = void Function(String status, Object? error);

class RealtimeSubscriptionManager {
  RealtimeSubscriptionManager({
    required this.supabase,
    required this.onRefresh,
    required this.onStatus,
    this.debounce = const Duration(milliseconds: 850),
    this.minimumRefreshGap = const Duration(milliseconds: 1600),
  });

  final SupabaseClient supabase;
  final RealtimeRefreshCallback onRefresh;
  final RealtimeStatusCallback onStatus;
  final Duration debounce;
  final Duration minimumRefreshGap;

  final List<dynamic> _channels = [];
  Timer? _refreshTimer;
  DateTime? _lastRefreshAt;
  bool _disposed = false;

  void start() {
    if (_disposed || _channels.isNotEmpty) return;
    final channel = supabase.channel('ceo-mobile-live-alerts-v2');
    for (final table in const [
      'appeals',
      'daily_entries',
      'notifications',
      'media_library',
      'all_sales',
      'installments',
      'users',
    ]) {
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        callback: (_) => _scheduleRefresh(),
      );
    }
    channel.subscribe((status, error) {
      if (_disposed) return;
      onStatus('$status', error);
    });
    _channels.add(channel);
  }

  void _scheduleRefresh() {
    if (_disposed || _refreshTimer?.isActive == true) return;
    final last = _lastRefreshAt;
    final sinceLast = last == null ? null : DateTime.now().difference(last);
    final wait = sinceLast != null && sinceLast < minimumRefreshGap
        ? minimumRefreshGap - sinceLast
        : debounce;
    _refreshTimer = Timer(wait, () {
      if (_disposed) return;
      _lastRefreshAt = DateTime.now();
      onRefresh();
    });
  }

  void dispose() {
    _disposed = true;
    _refreshTimer?.cancel();
    for (final channel in _channels) {
      supabase.removeChannel(channel);
    }
    _channels.clear();
  }
}
