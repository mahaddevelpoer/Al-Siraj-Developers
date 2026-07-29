import 'dart:async';
import 'dart:convert';

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

  Future<List<Map<String, dynamic>>> _tableRows(
    String table, {
    String? orderColumn = 'created_at',
    bool ascending = false,
    int limit = 500,
    Duration timeout = const Duration(seconds: 7),
  }) async {
    if (orderColumn != null) {
      final ordered = await _safeRows(
        () => supabase
            .from(table)
            .select('*')
            .order(orderColumn, ascending: ascending)
            .limit(limit),
        timeout: timeout,
      );
      if (ordered.isNotEmpty) return ordered;
    }
    return _safeRows(
      () => supabase.from(table).select('*').limit(limit),
      timeout: timeout,
    );
  }

  Future<List<Map<String, dynamic>>> _activeTowns() async {
    final viewRows = await _safeRows(
      () => supabase.from('ceo_mobile_active_towns').select('*'),
      timeout: const Duration(seconds: 5),
    );
    if (viewRows.isNotEmpty) return viewRows;
    final rows = await _safeRows(
      () => supabase.from('towns').select('*'),
    );
    return rows.where((row) {
      final deleted = textOf(rowValue(row, 'Deleted_At') ?? row['deleted_at']);
      final status = textOf(rowValue(row, 'Status') ?? row['status'], 'active').toLowerCase();
      return (deleted.isEmpty || deleted.toLowerCase() == 'null') &&
          !{'deleted', 'inactive', 'archived'}.contains(status);
    }).toList();
  }

  DashboardSummary? _lastKnownSummary;

  Future<DashboardSummary> loadDashboard({bool force = false}) {
    if (!force && _dashboardInFlight != null) return _dashboardInFlight!;
    final future = _loadDashboard().whenComplete(() => _dashboardInFlight = null);
    _dashboardInFlight = future;
    return future;
  }

  Future<DashboardSummary> _loadDashboard() async {
    List<List<Map<String, dynamic>>> results;
    try {
      results = await Future.wait<List<Map<String, dynamic>>>([
        _activeTowns(),
        _tableRows('appeals', limit: 500),
        _tableRows('daily_entries', limit: 700),
        _tableRows('all_sales', limit: 700),
        _tableRows('town_financial_summary', orderColumn: null, limit: 200),
      ]);
    } catch (_) {
      if (_lastKnownSummary != null) return _lastKnownSummary!;
      results = const [[], [], [], [], []];
    }

    final towns = results[0];
    final appeals = results[1];
    final entries = results[2];
    final sales = results[3];
    final summaryRows = results[4];
    final townNames = <String>{
      ...towns.map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'])),
      ...summaryRows.map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'])),
      ...entries.map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'])),
      ...sales.map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'])),
      ...appeals.map((row) => textOf(_townOfAppeal(row))),
    }.where((name) => name.isNotEmpty && name.toLowerCase() != 'null').toList()
      ..sort();

    final summaries = townNames.map((town) {
      final summary = summaryRows.firstWhere(
        (row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name']) == town,
        orElse: () => const <String, dynamic>{},
      );
      final townEntries = entries
          .where((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name']) == town)
          .where((row) {
            final st = normalizeStatus(row['review_status'] ?? rowValue(row, 'Review_Status') ?? 'approved');
            return st != 'pending' && st != 'rejected';
          })
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
      final pendingAppeals = appeals
          .where((row) => normalizeStatus(row['status']) == 'pending')
          .where((row) => _townOfAppeal(row) == town)
          .length;
      final summaryReceived = asNum(rowValue(summary, 'Total_Received') ?? summary['total_received']);
      final summaryExpenses = asNum(rowValue(summary, 'Total_Expenses') ?? summary['total_expenses']);
      final summaryPending = asNum(rowValue(summary, 'Pending_Collection') ?? summary['pending_collection']);
      return TownSummary(
        name: town,
        received: summaryReceived == 0 ? receivedFromEntries + saleReceived : summaryReceived,
        expenses: summaryExpenses == 0 ? expenses : summaryExpenses,
        pendingCollection: summaryPending == 0 ? pending : summaryPending,
        pendingApprovals: pendingAppeals,
        salesCount: townSales.length,
      );
    }).toList();

    final resultSummary = DashboardSummary(
      towns: summaries,
      pendingApprovals: summaries.fold<int>(0, (sum, town) => sum + town.pendingApprovals),
      received: summaries.fold<num>(0, (sum, town) => sum + town.received),
      expenses: summaries.fold<num>(0, (sum, town) => sum + town.expenses),
      pendingCollection: summaries.fold<num>(0, (sum, town) => sum + town.pendingCollection),
      salesCount: summaries.fold<int>(0, (sum, town) => sum + town.salesCount),
    );

    if (resultSummary.towns.isNotEmpty || resultSummary.received > 0) {
      _lastKnownSummary = resultSummary;
    } else if (_lastKnownSummary != null) {
      return _lastKnownSummary!;
    }

    return resultSummary;
  }

  Future<List<ReviewItem>> loadReviews(String status, {bool force = false}) {
    final key = normalizeStatus(status);
    if (!force && _reviewInFlight[key] != null) return _reviewInFlight[key]!;
    final future = _loadReviews(key)
        .timeout(const Duration(seconds: 25), onTimeout: () => <ReviewItem>[])
        .whenComplete(() => _reviewInFlight.remove(key));
    _reviewInFlight[key] = future;
    return future;
  }

  // ========================================================================
  // FIX: EXACT same query as inbox_repository.dart — the one that WORKS
  // Bell shows "1" because this query works. Now Approvals tab uses it too.
  // ========================================================================
  Future<List<ReviewItem>> _loadReviews(String status) async {
    final queryStatus = normalizeStatus(status);
    print('[repo] === LOAD REVIEWS: status=$status queryStatus=$queryStatus ===');

    // PRIMARY: Direct query — EXACT same as inbox_repository.dart (PROVEN WORKING)
    try {
      print('[repo] Running direct appeals query...');
      final raw = await supabase
          .from('appeals')
          .select(
            'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id(full_name,email,town_name)',
          )
          .eq('status', queryStatus)
          .order('created_at', ascending: false)
          .limit(reviewLimit)
          .timeout(const Duration(seconds: 10));

      print('[repo] Query returned: type=${raw.runtimeType}, length=${raw is List ? (raw as List).length : "N/A"}');
      
      if (raw is List && raw.isNotEmpty) {
        print('[repo] First row: ${raw.first}');
        final rows = raw.cast<Map<String, dynamic>>()
            .map((r) => {...r, 'review_kind': 'appeal'})
            .toList();
        print('[repo] Prepared ${rows.length} rows for normalization');
        
        final normalized = _normalizeReviewRows(rows, queryStatus);
        print('[repo] Final normalized count: ${normalized.length}');
        
        // If normalization returned 0 but we had data, show raw items anyway
        if (normalized.isEmpty && rows.isNotEmpty) {
          print('[repo] WARNING: Normalization returned 0 but raw had ${rows.length}. Creating fallback items...');
          return rows.map((r) => ReviewItem(
            id: r['id']?.toString() ?? '',
            kind: ReviewKind.appeal,
            status: normalizeStatus(r['status']),
            title: 'Appeal: ${r['appeal_type'] ?? "unknown"}',
            townName: r['town_name']?.toString() ?? 'No town',
            accountantName: 'Accountant',
            amount: 0,
            dateText: r['created_at']?.toString() ?? '',
            summary: r['reason']?.toString() ?? 'No details',
            raw: r,
          )).toList();
        }
        
        return normalized;
      }
      if (raw is List && raw.isEmpty) {
        print('[repo] Query returned 0 rows');
        return const [];
      }
    } catch (e, stack) {
      print('[repo] Direct query FAILED: $e');
      print('[repo] Stack: $stack');
    }

    // FALLBACK: ceo_mobile_review_inbox RPC
    try {
      print('[repo] Trying ceo_mobile_review_inbox RPC...');
      final raw = await supabase.rpc(
        'ceo_mobile_review_inbox',
        params: {'p_status': queryStatus, 'p_limit': reviewLimit},
      ).timeout(const Duration(seconds: 6));
      if (raw is List && raw.isNotEmpty) {
        print('[repo] inbox RPC got ${raw.length} rows');
        return _normalizeReviewRows(raw.cast<Map<String, dynamic>>(), queryStatus);
      }
    } catch (e) {
      print('[repo] inbox RPC failed: $e');
    }

    // FALLBACK: ceo_mobile_get_appeals RPC
    try {
      print('[repo] Trying ceo_mobile_get_appeals RPC...');
      final raw = await supabase.rpc(
        'ceo_mobile_get_appeals',
        params: {'p_status': queryStatus, 'p_limit': reviewLimit},
      ).timeout(const Duration(seconds: 8));
      final List<Map<String, dynamic>>? parsed;
      if (raw is List) {
        parsed = raw.cast<Map<String, dynamic>>();
      } else if (raw is String && raw.isNotEmpty && raw != 'null') {
        final decoded = jsonDecode(raw);
        if (decoded is List) parsed = decoded.cast<Map<String, dynamic>>();
        else parsed = null;
      } else {
        parsed = null;
      }
      if (parsed != null && parsed.isNotEmpty) {
        print('[repo] RPC fallback got ${parsed.length} rows');
        return _normalizeReviewRows(parsed, queryStatus);
      }
    } catch (_) {}

    print('[repo] === ALL METHODS RETURNED EMPTY ===');
    throw Exception('No appeals found for status=$queryStatus');
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
      final rawStatus = isDaily ? row['review_status'] ?? row['status'] : row['status'];
      if (isDaily && textOf(rawStatus).isEmpty) continue;
      final itemStatus = normalizeStatus(rawStatus);
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
    items.sort((a, b) {
      final aDate = DateTime.tryParse('${a.raw['created_at'] ?? a.raw['date'] ?? ''}');
      final bDate = DateTime.tryParse('${b.raw['created_at'] ?? b.raw['date'] ?? ''}');
      if (aDate != null && bDate != null) return bDate.compareTo(aDate);
      return b.dateText.compareTo(a.dateText);
    });
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

  Future<void> reviewNotificationAction({
    required String id,
    required String action,
    String table = '',
  }) async {
    final status = action == 'approve' ? 'approved' : action == 'reject' ? 'rejected' : '';
    if (id.isEmpty || status.isEmpty) return;
    final tableText = table.toLowerCase();
    if (tableText == 'daily_entries') {
      await _reviewDailyEntry(
        ReviewItem(
          id: id,
          kind: ReviewKind.dailyEntry,
          status: 'pending',
          title: 'Daily entry',
          townName: '',
          accountantName: '',
          amount: 0,
          dateText: '',
          summary: '',
          raw: const {},
        ),
        status,
      );
      return;
    }
    await _reviewAppeal(
      ReviewItem(
        id: id,
        kind: ReviewKind.appeal,
        status: 'pending',
        title: 'Appeal',
        townName: '',
        accountantName: '',
        amount: 0,
        dateText: '',
        summary: '',
        raw: const {},
      ),
      status,
    );
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
    String? townName,
    bool force = false,
  }) {
    if (!force && townName == null && _receiptInFlight != null) return _receiptInFlight!;
    final future = _loadDailyReceipts(date ?? DateTime.now(), townName: townName)
        .whenComplete(() => _receiptInFlight = null);
    if (townName == null) _receiptInFlight = future;
    return future;
  }

  Future<List<LedgerReceiptSummary>> _loadDailyReceipts(DateTime date, {String? townName}) async {
    final day = shortDate.format(date);
    
    // Fetch media library rows for this specific date and town (100% reliable)
    var mediaQuery = supabase.from('media_library').select('*').eq('report_date', day);
    if (townName != null) {
      mediaQuery = mediaQuery.eq('town_name', townName);
    }
    final mediaFuture = _safeRows(() => mediaQuery, timeout: const Duration(seconds: 8));

    // Fetch daily entries for this specific date and town (100% reliable)
    final rpcRows = await _safeRows(
      () => supabase.rpc(
        'ceo_mobile_daily_receipt_rows',
        params: {'p_report_date': day},
      ),
      timeout: const Duration(seconds: 6),
    );

    List<Map<String, dynamic>> rows = rpcRows;
    
    // If RPC failed or returned nothing, fallback to direct query by Date
    if (rows.isEmpty) {
      var entryQuery = supabase.from('daily_entries').select('*').eq('date', day);
      if (townName != null) {
        entryQuery = entryQuery.eq('town_name', townName);
      }
      rows = await _safeRows(() => entryQuery, timeout: const Duration(seconds: 8));
    }

    final mediaRows = (await mediaFuture).where((row) {
      final type = textOf(rowValue(row, 'Type') ?? row['type']).toLowerCase();
      return type == 'daily_ledger_receipt';
    }).toList();

    final cleanRows = rows.where((row) {
      final rowTown = textOf(row['town_name'] ?? rowValue(row, 'Town_Name'), 'No town');
      if (townName != null && rowTown != townName) return false;
      final status = normalizeStatus(row['review_status'] ?? rowValue(row, 'Review_Status') ?? 'approved');
      return status != 'pending' && status != 'rejected';
    }).toList();

    final towns = cleanRows
        .map((row) => textOf(row['town_name'] ?? rowValue(row, 'Town_Name'), 'No town'))
        .followedBy(mediaRows.map((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'], 'No town')))
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
        mediaRows: mediaRows
            .where((row) => textOf(rowValue(row, 'Town_Name') ?? row['town_name'], 'No town') == town)
            .toList(),
      );
    }).toList();
  }

  Future<TownDashboardDetail> loadTownDashboard(
    String townName, {
    DateTime? reportDate,
    bool force = false,
  }) async {
    final dashboard = await loadDashboard(force: force);
    final summary = dashboard.towns.firstWhere(
      (town) => town.name == townName,
      orElse: () => TownSummary(
        name: townName,
        received: 0,
        expenses: 0,
        pendingCollection: 0,
        pendingApprovals: 0,
        salesCount: 0,
      ),
    );
    final pending = await loadReviews('pending', force: true);
    final receipts = await loadDailyReceipts(
      date: reportDate ?? DateTime.now(),
      townName: townName,
      force: true,
    );
    return TownDashboardDetail(
      summary: summary,
      recentApprovals: pending.where((item) => item.townName == townName).take(10).toList(),
      receipt: receipts.isEmpty ? null : receipts.first,
    );
  }

  Future<List<OperatorPresence>> loadOperatorPresence() async {
    final rows = await _safeRows(
      () => supabase
          .from('users')
          .select('*')
          .inFilter('role', ['accountant', 'agent'])
          .order('last_seen_at', ascending: false)
          .limit(80),
      timeout: const Duration(seconds: 5),
    );
    return rows.map((row) {
      final onlineStatus = textOf(row['online_status']).toLowerCase();
      final lastSeen = textOf(
        row['last_seen_at'] ?? row['updated_at'] ?? row['created_at'],
      );
      final isSeenRecently = _seenRecently(lastSeen);
      final online = (onlineStatus == 'online' || onlineStatus == 'active') && isSeenRecently;
      
      String status = 'offline';
      if (isSeenRecently) {
        if (onlineStatus == 'online' || onlineStatus == 'active') {
          status = 'online';
        } else if (onlineStatus == 'away') {
          status = 'away';
        }
      }

      return OperatorPresence(
        name: textOf(
          row['full_name'] ?? row['name'] ?? row['email'],
          'Unknown operator',
        ),
        role: pretty(row['role'] ?? 'operator'),
        townName: textOf(row['town_name'] ?? row['Town_Name'] ?? row['town'], 'No town'),
        online: online,
        lastSeenText: lastSeen.isEmpty ? 'No activity time' : formatAnyDate(lastSeen),
        status: status,
      );
    }).toList();
  }

  bool _seenRecently(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return false;
    return DateTime.now().difference(parsed.toLocal()).inMinutes <= 3;
  }

  Future<Map<String, bool>> loadSystemSettings() async {
    try {
      final rows = await _safeRows(
        () => supabase.from('system_settings').select('key, value'),
        timeout: const Duration(seconds: 6),
      );
      final map = <String, bool>{};
      for (final row in rows) {
        final key = row['key']?.toString() ?? '';
        final val = row['value'];
        if (key.isNotEmpty) {
          map[key] = val == true || val?.toString() == 'true';
        }
      }
      return map;
    } catch (_) {
      return const {};
    }
  }

  Future<void> updateSystemSetting(String key, bool value) async {
    await supabase.from('system_settings').upsert({
      'key': key,
      'value': value,
      'updated_at': DateTime.now().toIso8601String(),
    }).timeout(const Duration(seconds: 8));
  }

  Future<void> scheduleAudit(String townName, DateTime date) async {
    final dateStr = date.toIso8601String().split('T')[0];
    await supabase.from('audit_schedules').upsert({
      'town_name': townName,
      'scheduled_date': dateStr,
      'status': 'pending',
      'updated_at': DateTime.now().toIso8601String(),
    }, onConflict: 'town_name,scheduled_date').timeout(const Duration(seconds: 8));
  }

  Future<List<AuditSchedule>> loadAuditSchedules() async {
    final rows = await _safeRows(
      () => supabase.from('audit_schedules').select('*').order('scheduled_date', ascending: false),
      timeout: const Duration(seconds: 6),
    );
    return rows.map((r) => AuditSchedule(
      id: r['id']?.toString() ?? '',
      townName: r['town_name']?.toString() ?? '',
      scheduledDate: r['scheduled_date']?.toString() ?? '',
      status: r['status']?.toString() ?? 'pending',
    )).toList();
  }

  Future<List<LockerAudit>> loadLockerAudits() async {
    final rows = await _safeRows(
      () => supabase.from('locker_audits').select('*').order('audit_date', ascending: false),
      timeout: const Duration(seconds: 6),
    );
    return rows.map((r) => LockerAudit(
      id: r['id']?.toString() ?? '',
      townName: r['town_name']?.toString() ?? '',
      auditDate: r['audit_date']?.toString() ?? '',
      systemBalance: asNum(r['system_balance']),
      physicalBalance: asNum(r['physical_balance']),
      discrepancy: asNum(r['discrepancy']),
      auditedBy: r['audited_by']?.toString() ?? '',
      report: mapFromAny(r['audit_report']),
    )).toList();
  }
}
