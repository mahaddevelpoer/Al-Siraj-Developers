import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'constants.dart';
import 'models.dart';
import 'utils.dart';

class CeoRepository {
  CeoRepository(this.supabase);

  final SupabaseClient supabase;
  final Map<String, Future<List<ReviewItem>>> _reviewInFlight = {};
  Future<DashboardSummary>? _dashboardInFlight;
  Future<List<LedgerReceiptSummary>>? _receiptInFlight;

  Future<List<Map<String, dynamic>>> _safeRows(
    Future<dynamic> Function() loader, {
    Duration timeout = const Duration(seconds: 9),
  }) async {
    try {
      final data = await loader().timeout(timeout);
      if (data is! List) return const [];
      return List<Map<String, dynamic>>.from(data);
    } catch (_) {
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> _activeTowns() async {
    final viewRows = await _safeRows(
      () => supabase.from('ceo_mobile_active_towns').select('*').order('town_name'),
      timeout: const Duration(seconds: 5),
    );
    if (viewRows.isNotEmpty) return viewRows;
    final rows = await _safeRows(
      () => supabase.from('towns').select('*').order('town_name'),
    );
    return rows.where((row) {
      final deleted = textOf(rowValue(row, 'Deleted_At') ?? row['deleted_at']);
      final status = textOf(rowValue(row, 'Status') ?? row['status'], 'active').toLowerCase();
      return (deleted.isEmpty || deleted.toLowerCase() == 'null') &&
          !{'deleted', 'inactive', 'archived'}.contains(status);
    }).toList();
  }

  Future<DashboardSummary> loadDashboard({bool force = false}) {
    if (!force && _dashboardInFlight != null) return _dashboardInFlight!;
    final future = _loadDashboard().whenComplete(() => _dashboardInFlight = null);
    _dashboardInFlight = future;
    return future;
  }

  Future<DashboardSummary> _loadDashboard() async {
    final results = await Future.wait<List<Map<String, dynamic>>>([
      _activeTowns(),
      _safeRows(() => supabase.from('appeals').select('*').eq('status', 'pending')),
      _safeRows(() => supabase.from('daily_entries').select('*').limit(500)),
      _safeRows(() => supabase.from('all_sales').select('*').limit(500)),
    ]);
    final towns = results[0];
    final appeals = results[1];
    final entries = results[2];
    final sales = results[3];
    final townNames = towns
        .map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name']))
        .where((name) => name.isNotEmpty)
        .toSet()
        .toList()
      ..sort();

    final summaries = townNames.map((town) {
      final townEntries = entries
          .where((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name']) == town)
          .toList();
      final townSales = sales
          .where((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name']) == town)
          .toList();
      final receivedFromEntries = townEntries
          .where((row) => textOf(rowValue(row, 'Type') ?? row['type']).toLowerCase() == 'income')
          .fold<num>(0, (sum, row) => sum + asNum(rowValue(row, 'Amount') ?? row['amount']));
      final expenses = townEntries
          .where((row) => textOf(rowValue(row, 'Type') ?? row['type']).toLowerCase() == 'expense')
          .fold<num>(0, (sum, row) => sum + asNum(rowValue(row, 'Amount') ?? row['amount']));
      final saleReceived = townSales.fold<num>(
        0,
        (sum, row) {
          final received = asNum(rowValue(row, 'Received_Amount') ?? row['received_amount']);
          final advance = asNum(rowValue(row, 'Advance_Amount_PKR') ?? row['advance_amount_pkr']);
          return sum + (received == 0 ? advance : received);
        },
      );
      final pending = townSales.fold<num>(
        0,
        (sum, row) => sum + asNum(rowValue(row, 'Remaining_Amount') ?? row['remaining_amount']),
      );
      final pendingAppeals = appeals.where((row) => _townOfAppeal(row) == town).length;
      return TownSummary(
        name: town,
        received: receivedFromEntries + saleReceived,
        expenses: expenses,
        pendingCollection: pending,
        pendingApprovals: pendingAppeals,
        salesCount: townSales.length,
      );
    }).toList();

    return DashboardSummary(
      towns: summaries,
      pendingApprovals: summaries.fold<int>(0, (sum, town) => sum + town.pendingApprovals),
      received: summaries.fold<num>(0, (sum, town) => sum + town.received),
      expenses: summaries.fold<num>(0, (sum, town) => sum + town.expenses),
      pendingCollection: summaries.fold<num>(0, (sum, town) => sum + town.pendingCollection),
      salesCount: summaries.fold<int>(0, (sum, town) => sum + town.salesCount),
    );
  }

  Future<List<ReviewItem>> loadReviews(String status, {bool force = false}) {
    final key = normalizeStatus(status);
    if (!force && _reviewInFlight[key] != null) return _reviewInFlight[key]!;
    final future = _loadReviews(key)
        .timeout(const Duration(seconds: 12), onTimeout: () => <ReviewItem>[])
        .whenComplete(() => _reviewInFlight.remove(key));
    _reviewInFlight[key] = future;
    return future;
  }

  Future<List<ReviewItem>> _loadReviews(String status) async {
    List<List<Map<String, dynamic>>> results;
    try {
      results = await Future.wait<List<Map<String, dynamic>>>([
        _safeRows(
          () => supabase
              .from('appeals')
              .select('*')
              .eq('status', status)
              .order('created_at', ascending: false)
              .limit(reviewLimit),
          timeout: const Duration(seconds: 5),
        ),
        _safeRows(
          () => supabase
              .from('daily_entries')
              .select('*')
              .eq('review_status', status)
              .order('created_at', ascending: false)
              .limit(reviewLimit),
          timeout: const Duration(seconds: 5),
        ),
      ]).timeout(const Duration(seconds: 7));
    } catch (_) {
      results = const [<Map<String, dynamic>>[], <Map<String, dynamic>>[]];
    }

    final directItems = _normalizeReviewRows([
      ...results[0].map((row) => {...row, 'review_kind': 'appeal'}),
      ...results[1].map((row) => {...row, 'review_kind': 'dailyEntry'}),
    ], status);
    if (directItems.isNotEmpty) return directItems;

    final rpcRows = await _safeRows(
      () => supabase.rpc(
        'ceo_mobile_review_inbox',
        params: {'p_status': status, 'p_limit': reviewLimit},
      ),
      timeout: const Duration(seconds: 5),
    );
    return _normalizeReviewRows(rpcRows, status);
  }

  List<ReviewItem> _normalizeReviewRows(
    List<Map<String, dynamic>> rows,
    String status,
  ) {
    final items = <ReviewItem>[];
    final seen = <String>{};
    for (final row in rows) {
      final kindText = textOf(row['review_kind'] ?? row['_review_kind']);
      final isDaily = kindText == 'dailyEntry' || row.containsKey('review_status');
      final data = mapFromAny(row['requested_data']);
      final user = mapFromAny(row['requested_by_user_id']);
      final id = textOf(row['id'] ?? row['entry_id'] ?? rowValue(row, 'Entry_ID'));
      if (id.isEmpty) continue;
      final key = '${isDaily ? 'entry' : 'appeal'}:$id';
      if (!seen.add(key)) continue;
      final itemStatus = normalizeStatus(
        isDaily ? row['review_status'] ?? row['status'] : row['status'],
      );
      if (itemStatus != status) continue;
      final town = isDaily
          ? textOf(row['town_name'] ?? rowValue(row, 'Town_Name') ?? data['town_name'], 'No town')
          : textOf(_townOfAppeal(row), 'No town');
      final amount = asNum(row['amount'] ?? rowValue(row, 'Amount') ?? data['amount']);
      final title = isDaily
          ? 'Daily ${pretty(row['type'] ?? rowValue(row, 'Type') ?? data['type'])}'
          : pretty(row['appeal_type']);
      items.add(
        ReviewItem(
          id: id,
          kind: isDaily ? ReviewKind.dailyEntry : ReviewKind.appeal,
          status: itemStatus,
          title: title,
          townName: town,
          accountantName: textOf(user['full_name'] ?? user['email'], 'Accountant'),
          amount: amount,
          dateText: formatAnyDate(row['date'] ?? row['created_at'] ?? data['date']),
          summary: textOf(
            row['description'] ??
                row['reason'] ??
                data['description'] ??
                data['category'] ??
                data['type'],
            'No extra details',
          ),
          raw: row,
        ),
      );
    }
    items.sort((a, b) => b.dateText.compareTo(a.dateText));
    return items.take(reviewLimit).toList();
  }

  String _townOfAppeal(Map<String, dynamic> row) {
    final data = mapFromAny(row['requested_data']);
    final user = mapFromAny(row['requested_by_user_id']);
    return textOf(
      data['townName'] ??
          data['Town_Name'] ??
          data['town_name'] ??
          data['town'] ??
          row['town_name'] ??
          user['town_name'] ??
          user['town_id'],
    );
  }

  Future<void> review(ReviewItem item, String newStatus) async {
    final status = normalizeStatus(newStatus);
    if (status == 'pending') throw Exception('Invalid review status');
    if (item.kind == ReviewKind.dailyEntry) {
      await _reviewDailyEntry(item, status);
    } else {
      await _reviewAppeal(item, status);
    }
  }

  Future<void> _reviewAppeal(ReviewItem item, String status) async {
    try {
      await supabase.rpc(
        'ceo_review_appeal',
        params: {'appeal_id': item.id, 'new_status': status},
      ).timeout(const Duration(seconds: 10));
      return;
    } catch (_) {
      await supabase
          .from('appeals')
          .update({
            'status': status,
            'reviewed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', item.id)
          .timeout(const Duration(seconds: 10));
    }
  }

  Future<void> _reviewDailyEntry(ReviewItem item, String status) async {
    try {
      await supabase.rpc(
        'ceo_review_daily_entry',
        params: {'entry_uuid': item.id, 'new_status': status},
      ).timeout(const Duration(seconds: 10));
      return;
    } catch (_) {
      await supabase
          .from('daily_entries')
          .update({
            'review_status': status,
            'reviewed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', item.id)
          .timeout(const Duration(seconds: 10));
    }
  }

  Future<List<LedgerReceiptSummary>> loadDailyReceipts({
    DateTime? date,
    bool force = false,
  }) {
    if (!force && _receiptInFlight != null) return _receiptInFlight!;
    final future = _loadDailyReceipts(date ?? DateTime.now())
        .whenComplete(() => _receiptInFlight = null);
    _receiptInFlight = future;
    return future;
  }

  Future<List<LedgerReceiptSummary>> _loadDailyReceipts(DateTime date) async {
    final day = shortDate.format(date);
    final rpcRows = await _safeRows(
      () => supabase.rpc(
        'ceo_mobile_daily_receipt_rows',
        params: {'p_report_date': day},
      ),
      timeout: const Duration(seconds: 6),
    );
    final rows = rpcRows.isNotEmpty
        ? rpcRows
        : await _safeRows(
            () => supabase
                .from('daily_entries')
                .select('*')
                .order('created_at', ascending: false)
                .limit(500),
          );
    final cleanRows = rows.where((row) {
      final dateText = textOf(row['date'] ?? rowValue(row, 'Date'));
      final status = normalizeStatus(row['review_status'] ?? rowValue(row, 'Review_Status') ?? 'approved');
      return dateText.startsWith(day) && status != 'pending' && status != 'rejected';
    }).toList();
    final towns = cleanRows
        .map((row) => textOf(row['town_name'] ?? rowValue(row, 'Town_Name'), 'No town'))
        .toSet()
        .toList()
      ..sort();
    return towns.map((town) {
      final townRows = cleanRows
          .where((row) => textOf(row['town_name'] ?? rowValue(row, 'Town_Name'), 'No town') == town)
          .toList();
      final income = townRows
          .where((row) => textOf(row['type'] ?? rowValue(row, 'Type')).toLowerCase() == 'income')
          .fold<num>(0, (sum, row) => sum + asNum(row['amount'] ?? rowValue(row, 'Amount')));
      final expense = townRows
          .where((row) => textOf(row['type'] ?? rowValue(row, 'Type')).toLowerCase() == 'expense')
          .fold<num>(0, (sum, row) => sum + asNum(row['amount'] ?? rowValue(row, 'Amount')));
      return LedgerReceiptSummary(
        townName: town,
        reportDate: day,
        income: income,
        expense: expense,
        rows: townRows,
      );
    }).toList();
  }

  Future<List<OperatorPresence>> loadOperatorPresence() async {
    final presenceRows = await _safeRows(
      () => supabase
          .from('operator_presence')
          .select('*')
          .order('last_seen_at', ascending: false)
          .limit(80),
      timeout: const Duration(seconds: 5),
    );
    final rows = presenceRows.isNotEmpty
        ? presenceRows
        : await _safeRows(
            () => supabase
                .from('users')
                .select('*')
                .order('updated_at', ascending: false)
                .limit(80),
            timeout: const Duration(seconds: 5),
          );
    return rows.map((row) {
      final lastSeen = textOf(
        row['last_seen_at'] ??
            row['last_seen'] ??
            row['online_at'] ??
            row['updated_at'] ??
            row['created_at'],
      );
      final onlineRaw = row['is_online'] ?? row['online'] ?? row['status'];
      final onlineText = textOf(onlineRaw).toLowerCase();
      final online = onlineRaw == true ||
          onlineText == 'online' ||
          onlineText == 'active' ||
          _seenRecently(lastSeen);
      return OperatorPresence(
        name: textOf(
          row['full_name'] ?? row['name'] ?? row['email'] ?? row['user_email'],
          'Unknown operator',
        ),
        role: pretty(row['role'] ?? row['user_role'] ?? 'operator'),
        townName: textOf(row['town_name'] ?? row['Town_Name'] ?? row['town'], 'No town'),
        online: online,
        lastSeenText: lastSeen.isEmpty ? 'No activity time' : formatAnyDate(lastSeen),
      );
    }).toList();
  }

  bool _seenRecently(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return false;
    return DateTime.now().difference(parsed.toLocal()).inMinutes <= 3;
  }
}
