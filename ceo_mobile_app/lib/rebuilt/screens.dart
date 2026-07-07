import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:shared_preferences/shared_preferences.dart';
import '../services/appeals_service.dart';
import 'constants.dart';
import 'models.dart';
import 'notification_service.dart';
import 'repository.dart';
import 'utils.dart';
import 'widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});
  final VoidCallback onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  Object? _error;

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = Supabase.instance.client.auth;
      final res = await auth
          .signInWithPassword(
            email: _email.text.trim(),
            password: _password.text,
          )
          .timeout(const Duration(seconds: 15));
      final user = res.user;
      if (user == null) throw Exception('Login failed');
      final profileRows = await Supabase.instance.client
          .from('users')
          .select('role,is_active')
          .eq('id', user.id)
          .limit(1)
          .timeout(const Duration(seconds: 10));
      final profile = List<Map<String, dynamic>>.from(profileRows);
      final role = profile.isEmpty ? 'ceo' : '${profile.first['role'] ?? ''}'.toLowerCase();
      if (role != 'ceo') throw Exception('Only CEO can use this app.');
      widget.onLoggedIn();
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: AppLogo(size: 86)),
                  const SizedBox(height: 24),
                  const Text(
                    'AL SIRAJ DEVELOPERS',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: kText,
                      fontWeight: FontWeight.w900,
                      fontSize: 27,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'CEO command center',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: kMuted, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 28),
                  AppCard(
                    child: Column(
                      children: [
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.email_rounded),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                            prefixIcon: Icon(Icons.lock_rounded),
                          ),
                          onSubmitted: (_) {
                            if (!_busy) {
                              unawaited(_login());
                            }
                          },
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            friendlyError(_error!),
                            style: const TextStyle(color: kRed, fontWeight: FontWeight.w700),
                          ),
                        ],
                        const SizedBox(height: 18),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton(
                            onPressed: _busy ? null : _login,
                            child: _busy
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Text('Login as CEO'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class CeoShell extends StatefulWidget {
  const CeoShell({super.key});

  @override
  State<CeoShell> createState() => _CeoShellState();
}

class _CeoShellState extends State<CeoShell> {
  final repo = CeoRepository(Supabase.instance.client);
  int _tab = 0;
  StreamSubscription<Map<String, dynamic>>? _tapSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(CeoNotificationService.startFcm());
    });
    _tapSub = notificationTapStream.stream.listen((data) {
      final route = '${data['route'] ?? ''}';
      final action = '${data['action'] ?? ''}';
      final id = '${data['id'] ?? ''}';
      if (!mounted) return;
      if ((action == 'approve' || action == 'reject') && id.isNotEmpty) {
        unawaited(repo.reviewNotificationAction(
          id: id,
          action: action,
          table: '${data['table'] ?? ''}',
        ));
      }
      if (route == 'approvals' || route == 'appeals') setState(() => _tab = 1);
      if (route == 'reports' || route == 'daily_report') setState(() => _tab = 2);
    });
  }

  @override
  void dispose() {
    _tapSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      OverviewScreen(repo: repo, onOpenApprovals: () => setState(() => _tab = 1)),
      ApprovalsScreen(repo: repo),
      ReportsScreen(repo: repo),
      MoreScreen(repo: repo),
    ];
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(child: pages[_tab]),
      bottomNavigationBar: SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: kSurface,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: kLine),
            boxShadow: [
              BoxShadow(
                color: kBlue.withValues(alpha: 0.09),
                blurRadius: 26,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              _NavItem(icon: Icons.dashboard_rounded, label: 'Home', selected: _tab == 0, onTap: () => setState(() => _tab = 0)),
              _NavItem(icon: Icons.rule_rounded, label: 'Approvals', selected: _tab == 1, onTap: () => setState(() => _tab = 1)),
              _NavItem(icon: Icons.receipt_long_rounded, label: 'Reports', selected: _tab == 2, onTap: () => setState(() => _tab = 2)),
              _NavItem(icon: Icons.grid_view_rounded, label: 'More', selected: _tab == 3, onTap: () => setState(() => _tab = 3)),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected ? kBlue.withValues(alpha: 0.1) : Colors.transparent,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: selected ? kBlue : kMuted),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  color: selected ? kBlue : kMuted,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OverviewScreen extends StatefulWidget {
  const OverviewScreen({super.key, required this.repo, required this.onOpenApprovals});
  final CeoRepository repo;
  final VoidCallback onOpenApprovals;

  @override
  State<OverviewScreen> createState() => _OverviewScreenState();
}

class _OverviewScreenState extends State<OverviewScreen> {
  late Future<DashboardSummary> _future = widget.repo.loadDashboard();
  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    _setupRealtime();
  }

  @override
  void dispose() {
    final ch = _realtimeChannel;
    if (ch != null) {
      Supabase.instance.client.removeChannel(ch);
    }
    super.dispose();
  }

  void _setupRealtime() {
    _realtimeChannel = Supabase.instance.client
        .channel('ceo-mobile-overview')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'appeals',
          callback: (_) {
            if (mounted) unawaited(_refresh());
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'appeals',
          callback: (_) {
            if (mounted) unawaited(_refresh());
          },
        )
        .subscribe();
  }

  Future<void> _refresh() async {
    setState(() => _future = widget.repo.loadDashboard(force: true));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DashboardSummary>(
      future: _future,
      builder: (context, snap) {
        final data = snap.data;
        return ScreenScaffold(
          title: 'Overview',
          onRefresh: _refresh,
          actions: [
            IconButton(
              onPressed: widget.onOpenApprovals,
              icon: Badge(
                label: Text('${data?.pendingApprovals ?? 0}'),
                isLabelVisible: (data?.pendingApprovals ?? 0) > 0,
                child: const Icon(Icons.notifications_rounded, color: kText),
              ),
            ),
          ],
          children: [
            AppCard(
              child: Row(
                children: [
                  const AppLogo(size: 56),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'CEO command center',
                          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Approvals, town balances, and daily reports.',
                          style: TextStyle(color: kMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (snap.connectionState == ConnectionState.waiting && data == null)
              const LoadingBlock(),
            if (snap.hasError && data == null)
              ErrorBlock(error: snap.error!, onRetry: _refresh),
            if (data != null) ...[
              MetricCard(label: 'Cash balance', value: money.format(data.cash), icon: Icons.account_balance_wallet_rounded, color: kBlue),
              MetricCard(label: 'Total received', value: money.format(data.received), icon: Icons.trending_up_rounded, color: kGreen),
              MetricCard(label: 'Total expenses', value: money.format(data.expenses), icon: Icons.trending_down_rounded, color: kRed),
              MetricCard(label: 'Pending collection', value: money.format(data.pendingCollection), icon: Icons.pending_actions_rounded, color: kAmber),
              const SizedBox(height: 8),
              const Text('Towns', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(height: 10),
              if (data.towns.isEmpty) const EmptyBlock(text: 'No active towns found.'),
              for (final town in data.towns)
                AppCard(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TownDashboardScreen(repo: widget.repo, town: town),
                      ),
                    );
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              town.name,
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
                            ),
                          ),
                          StatusPill(
                            text: '${town.pendingApprovals} pending',
                            color: town.pendingApprovals > 0 ? kAmber : kGreen,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('Cash: ${money.format(town.cash)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text('Pending: ${money.format(town.pendingCollection)} | Sales: ${town.salesCount}', style: const TextStyle(color: kMuted)),
                      const SizedBox(height: 8),
                      const Row(
                        children: [
                          Text('Open town dashboard', style: TextStyle(color: kBlue, fontWeight: FontWeight.w800)),
                          SizedBox(width: 4),
                          Icon(Icons.arrow_forward_rounded, size: 16, color: kBlue),
                        ],
                      ),
                    ],
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}

class TownDashboardScreen extends StatefulWidget {
  const TownDashboardScreen({super.key, required this.repo, required this.town});
  final CeoRepository repo;
  final TownSummary town;

  @override
  State<TownDashboardScreen> createState() => _TownDashboardScreenState();
}

class _TownDashboardScreenState extends State<TownDashboardScreen> {
  DateTime _date = DateTime.now();
  late Future<TownDashboardDetail> _future = widget.repo.loadTownDashboard(widget.town.name, reportDate: _date);

  Future<void> _refresh() async {
    setState(() {
      _future = widget.repo.loadTownDashboard(widget.town.name, reportDate: _date, force: true);
    });
    await _future;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDate: _date,
    );
    if (picked == null) return;
    setState(() {
      _date = picked;
      _future = widget.repo.loadTownDashboard(widget.town.name, reportDate: _date, force: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(
        child: FutureBuilder<TownDashboardDetail>(
          future: _future,
          builder: (context, snap) {
            final detail = snap.data;
            final summary = detail?.summary ?? widget.town;
            final receipt = detail?.receipt;
            return ScreenScaffold(
              title: summary.name,
              onRefresh: _refresh,
              actions: [
                IconButton(onPressed: _pickDate, icon: const Icon(Icons.calendar_month_rounded)),
                IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close_rounded)),
              ],
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(summary.name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
                      const SizedBox(height: 6),
                      Text(
                        'Town dashboard | ${shortDate.format(_date)}',
                        style: const TextStyle(color: kMuted, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
                if (snap.connectionState == ConnectionState.waiting && detail == null)
                  const LoadingBlock(text: 'Loading town dashboard...'),
                if (snap.hasError && detail == null)
                  ErrorBlock(error: snap.error!, onRetry: _refresh),
                MetricCard(label: 'Cash balance', value: money.format(summary.cash), icon: Icons.account_balance_wallet_rounded, color: kBlue),
                MetricCard(label: 'Total received', value: money.format(summary.received), icon: Icons.south_west_rounded, color: kGreen),
                MetricCard(label: 'Total expenses', value: money.format(summary.expenses), icon: Icons.north_east_rounded, color: kRed),
                MetricCard(label: 'Pending collection', value: money.format(summary.pendingCollection), icon: Icons.pending_actions_rounded, color: kAmber),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('8PM daily ledger receipt', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                      const SizedBox(height: 6),
                      Text(
                        receipt == null
                            ? 'No uploaded/approved receipt rows for this town and date yet.'
                            : '${receipt.rows.length} ledger rows and ${receipt.mediaRows.length} receipt files ready.',
                        style: const TextStyle(color: kMuted),
                      ),
                      if (receipt != null) ...[
                        const SizedBox(height: 12),
                        Text('Income: ${money.format(receipt.income)}'),
                        Text('Expense: ${money.format(receipt.expense)}'),
                        Text('Cash: ${money.format(receipt.cash)}', style: const TextStyle(fontWeight: FontWeight.w900)),
                      ],
                    ],
                  ),
                ),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Pending approvals for this town', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                      const SizedBox(height: 8),
                      if ((detail?.recentApprovals ?? const <ReviewItem>[]).isEmpty)
                        const Text('No pending approvals for this town.', style: TextStyle(color: kMuted)),
                      for (final item in detail?.recentApprovals ?? const <ReviewItem>[])
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Row(
                            children: [
                              Icon(item.icon, color: kAmber),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  '${item.title} | ${money.format(item.amount)}',
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
                              ),
                              const StatusPill(text: 'pending', color: kAmber),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  String _status = 'pending';
  List<ReviewItem> _rows = const [];
  Object? _error;
  bool _loading = true;
  bool _reviewing = false;
  int _loadToken = 0;
  RealtimeChannel? _realtimeChannel;
  
  // NEW: Direct appeals service - bypasses broken repo layers
  late final AppealsService _appealsService;

  @override
  void initState() {
    super.initState();
    _appealsService = AppealsService(Supabase.instance.client);
    unawaited(_load(force: true));
    _setupRealtime();
  }

  @override
  void dispose() {
    final ch = _realtimeChannel;
    if (ch != null) {
      Supabase.instance.client.removeChannel(ch);
    }
    super.dispose();
  }

  void _setupRealtime() {
    _realtimeChannel = Supabase.instance.client
        .channel('ceo-mobile-approvals')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'appeals',
          callback: (_) {
            if (mounted) unawaited(_load(force: true));
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'appeals',
          callback: (_) {
            if (mounted) unawaited(_load(force: true));
          },
        )
        .subscribe();
  }

  Future<void> _refresh({bool force = true}) async {
    await _load(force: force);
  }

  void _change(String status) {
    if (_status == status && _loading) return;
    setState(() {
      _status = status;
    });
    unawaited(_load(force: true));
  }

  // NEW LOAD METHOD - Uses AppealsService directly, NO repo wrapper
  Future<void> _load({bool force = true}) async {
    final token = ++_loadToken;
    print('[APPROVALS-UI] === LOAD START === token=$token status=$_status');
    
    setState(() {
      _loading = true;
      _error = null;
      _rows = const [];
    });

    try {
      // DIRECT CALL to AppealsService - bypasses all broken layers
      final rows = await _appealsService.loadAppeals(_status);
      
      print('[APPROVALS-UI] Service returned ${rows.length} rows');
      if (rows.isNotEmpty) {
        print('[APPROVALS-UI] First row: id=${rows.first.id}, title=${rows.first.title}');
      }
      
      if (!mounted || token != _loadToken) {
        print('[APPROVALS-UI] SKIPPED - token mismatch');
        return;
      }
      
      print('[APPROVALS-UI] SETTING STATE with ${rows.length} rows');
      setState(() {
        _rows = rows;
        _loading = false;
      });
      print('[APPROVALS-UI] STATE UPDATED');
      
    } catch (e, stack) {
      print('[APPROVALS-UI] ERROR: $e');
      print('[APPROVALS-UI] STACK: $stack');
      if (!mounted || token != _loadToken) return;
      setState(() {
        _error = e;
        _rows = const [];
        _loading = false;
      });
    }
  }

  Future<void> _review(ReviewItem item, String status) async {
    setState(() => _reviewing = true);
    try {
      await _appealsService.reviewAppeal(item.id, status);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${item.title} $status')),
      );
      await _refresh(force: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyError(e)), backgroundColor: kRed),
      );
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    final isError = _error != null;
    final errorText = isError ? '${_error}' : '';

    return ScreenScaffold(
      title: 'Approvals',
      onRefresh: _refresh,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'CEO approvals',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22),
              ),
              const SizedBox(height: 6),
              Text(
                _loading ? 'Checking $_status approvals...' : '${rows.length} $_status approvals found.',
                style: const TextStyle(color: kMuted),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _FilterChip(label: 'pending', value: _status, onTap: _change),
                  _FilterChip(label: 'approved', value: _status, onTap: _change),
                  _FilterChip(label: 'rejected', value: _status, onTap: _change),
                ],
              ),
            ],
          ),
        ),
        if (_loading) const LoadingBlock(text: 'Loading approvals...'),
        if (!_loading && isError) ErrorBlock(error: _error!, onRetry: _refresh),
        if (!_loading && !isError && rows.isEmpty) EmptyBlock(text: 'No $_status approvals.'),
        for (final item in rows) _ApprovalCard(item: item, status: _status, reviewing: _reviewing, onReview: _review),
      ],
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({
    required this.item,
    required this.status,
    required this.reviewing,
    required this.onReview,
  });

  final ReviewItem item;
  final String status;
  final bool reviewing;
  final Future<void> Function(ReviewItem item, String status) onReview;

  @override
  Widget build(BuildContext context) {
    final color = item.status == 'approved'
        ? kGreen
        : item.status == 'rejected'
            ? kRed
            : kAmber;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(item.icon, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  item.title,
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
              StatusPill(text: item.status, color: color),
            ],
          ),
          const SizedBox(height: 10),
          Text('Town: ${item.townName}', style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('By: ${item.accountantName} | ${item.dateText}', style: const TextStyle(color: kMuted)),
          if (item.amount > 0) ...[
            const SizedBox(height: 4),
            Text('Amount: ${money.format(item.amount)}', style: const TextStyle(color: kText)),
          ],
          const SizedBox(height: 8),
          Text(item.summary, style: const TextStyle(color: kMuted)),
          if (status == 'pending') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: reviewing ? null : () => onReview(item, 'rejected'),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: reviewing ? null : () => onReview(item, 'approved'),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final void Function(String value) onTap;

  @override
  Widget build(BuildContext context) {
    final selected = label == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(label),
      selectedColor: kBlue.withValues(alpha: 0.16),
      labelStyle: TextStyle(color: selected ? kBlue : kMuted, fontWeight: FontWeight.w900),
    );
  }
}

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  DateTime _date = DateTime.now();
  late Future<List<LedgerReceiptSummary>> _future = widget.repo.loadDailyReceipts(date: _date);

  Future<void> _refresh() async {
    setState(() => _future = widget.repo.loadDailyReceipts(date: _date, force: true));
    await _future;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDate: _date,
    );
    if (picked == null) return;
    setState(() {
      _date = picked;
      _future = widget.repo.loadDailyReceipts(date: _date, force: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<LedgerReceiptSummary>>(
      future: _future,
      builder: (context, snap) {
        final rows = snap.data ?? const <LedgerReceiptSummary>[];
        return ScreenScaffold(
          title: 'Reports',
          onRefresh: _refresh,
          actions: [
            IconButton(onPressed: _pickDate, icon: const Icon(Icons.calendar_month_rounded)),
          ],
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('8PM daily report bundle', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
                  const SizedBox(height: 6),
                  Text(
                    'CEO receives one grouped notification when town receipts are ready.',
                    style: const TextStyle(color: kMuted, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: StatusPill(
                          text: '${rows.length} town receipts',
                          color: rows.isEmpty ? kAmber : kGreen,
                        ),
                      ),
                      Text(shortDate.format(_date), style: const TextStyle(color: kText, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ],
              ),
            ),
            if (snap.connectionState == ConnectionState.waiting && rows.isEmpty)
              const LoadingBlock(text: 'Loading daily receipts...'),
            if (snap.hasError && rows.isEmpty)
              ErrorBlock(error: snap.error!, onRetry: _refresh),
            if (rows.isEmpty && !snap.hasError && snap.connectionState != ConnectionState.waiting)
              const EmptyBlock(text: 'No 8PM receipt rows for this date yet. If a town was offline, it will appear after sync.'),
            for (final row in rows)
              AppCard(
                onTap: () => _showReceipt(context, row),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.townName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                    const SizedBox(height: 8),
                    Text('Income: ${money.format(row.income)}'),
                    Text('Expense: ${money.format(row.expense)}'),
                    Text('Cash: ${money.format(row.cash)}', style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Text(
                      '${row.rows.length} ledger rows | ${row.mediaRows.length} receipt files',
                      style: const TextStyle(color: kMuted),
                    ),
                    const SizedBox(height: 8),
                    const Text('Tap to preview receipt rows', style: TextStyle(color: kBlue, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }

  void _showReceipt(BuildContext context, LedgerReceiptSummary receipt) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: kSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (context) {
        return SafeArea(
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.78,
            minChildSize: 0.35,
            maxChildSize: 0.94,
            builder: (context, controller) {
              return ListView(
                controller: controller,
                padding: const EdgeInsets.all(18),
                children: [
                  Text(receipt.townName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text('Daily ledger receipt | ${receipt.reportDate}', style: const TextStyle(color: kMuted)),
                  const SizedBox(height: 14),
                  MetricCard(label: 'Income', value: money.format(receipt.income), icon: Icons.south_west_rounded, color: kGreen),
                  MetricCard(label: 'Expense', value: money.format(receipt.expense), icon: Icons.north_east_rounded, color: kRed),
                  MetricCard(label: 'Cash movement', value: money.format(receipt.cash), icon: Icons.account_balance_rounded, color: kBlue),
                  const SizedBox(height: 8),
                  const Text('Receipt rows', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                  const SizedBox(height: 8),
                  if (receipt.mediaRows.isNotEmpty) ...[
                    const Text('Generated receipt files', style: TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    for (final media in receipt.mediaRows)
                      AppCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              textOf(rowValue(media, 'Title') ?? media['title'], 'Daily ledger receipt'),
                              style: const TextStyle(fontWeight: FontWeight.w900),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              textOf(rowValue(media, 'Pdf_Path') ?? media['pdf_path'] ?? rowValue(media, 'File_Path') ?? media['file_path'], 'No file path saved'),
                              style: const TextStyle(color: kMuted),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 8),
                    const Text('Ledger rows', style: TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                  ],
                  if (receipt.rows.isEmpty)
                    const EmptyBlock(text: 'No entry rows inside this receipt yet.'),
                  for (final row in receipt.rows)
                    AppCard(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            pretty(row['type'] ?? rowValue(row, 'Type')),
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 4),
                          Text(textOf(row['description'] ?? rowValue(row, 'Description'), 'No description')),
                          const SizedBox(height: 4),
                          Text(
                            money.format(asNum(row['amount'] ?? rowValue(row, 'Amount'))),
                            style: const TextStyle(fontWeight: FontWeight.w900, color: kBlue),
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  bool _deviceLockEnabled = false;
  bool _loadingLock = true;

  @override
  void initState() {
    super.initState();
    _loadSetting();
  }

  Future<void> _loadSetting() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _deviceLockEnabled = prefs.getBool('biometric_enabled') ?? false;
      _loadingLock = false;
    });
  }

  Future<void> _toggleDeviceLock(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('biometric_enabled', enabled);
    if (mounted) setState(() => _deviceLockEnabled = enabled);
  }

  @override
  Widget build(BuildContext context) {
    return ScreenScaffold(
      title: 'More',
      children: [
        AppCard(
          child: ListTile(
            leading: const Icon(Icons.verified_user_rounded, color: kBlue),
            title: const Text('Push notifications'),
            subtitle: const Text('FCM topic: ceo-alerts'),
            trailing: const StatusPill(text: 'active', color: kGreen),
            contentPadding: EdgeInsets.zero,
          ),
        ),
        AppCard(
          child: ListTile(
            leading: const Icon(Icons.people_alt_rounded, color: kTeal),
            title: const Text('Who is online'),
            subtitle: const Text('Town operators and last activity'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => WhoOnlineScreen(repo: widget.repo)),
              );
            },
            contentPadding: EdgeInsets.zero,
          ),
        ),
        AppCard(
          child: SwitchListTile(
            secondary: const Icon(Icons.lock_outline, color: kAmber),
            title: const Text('Device Lock'),
            subtitle: Text(
              _deviceLockEnabled ? 'Fingerprint / PIN on app open' : 'Fingerprint / PIN required for unlock',
            ),
            value: _deviceLockEnabled,
            onChanged: _loadingLock ? null : _toggleDeviceLock,
            contentPadding: EdgeInsets.zero,
          ),
        ),
        AppCard(
          child: ListTile(
            leading: const Icon(Icons.logout_rounded, color: kRed),
            title: const Text('Logout'),
            subtitle: const Text('Sign out from CEO mobile app'),
            onTap: () async {
              await Supabase.instance.client.auth.signOut();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(
                    builder: (loginContext) => LoginScreen(
                      onLoggedIn: () {
                        Navigator.of(loginContext).pushAndRemoveUntil(
                          MaterialPageRoute(builder: (_) => const CeoShell()),
                          (_) => false,
                        );
                      },
                    ),
                  ),
                  (_) => false,
                );
              }
            },
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ],
    );
  }
}

class WhoOnlineScreen extends StatefulWidget {
  const WhoOnlineScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<WhoOnlineScreen> createState() => _WhoOnlineScreenState();
}

class _WhoOnlineScreenState extends State<WhoOnlineScreen> {
  List<OperatorPresence> _rows = const [];
  bool _loading = true;
  Object? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _channel = Supabase.instance.client
        .channel('ceo-operator-presence')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'operator_presence',
          callback: (_) => unawaited(_load(silent: true)),
        )
        .subscribe();
  }

  @override
  void dispose() {
    final channel = _channel;
    if (channel != null) {
      Supabase.instance.client.removeChannel(channel);
    }
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final rows = await widget.repo
          .loadOperatorPresence()
          .timeout(const Duration(seconds: 8), onTimeout: () => <OperatorPresence>[]);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final onlineCount = _rows.where((row) => row.online).length;
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(
        child: ScreenScaffold(
          title: 'Who is online',
          onRefresh: () => _load(),
          actions: [
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close_rounded),
            ),
          ],
          children: [
            MetricCard(
              label: 'Online now',
              value: '$onlineCount / ${_rows.length}',
              icon: Icons.wifi_tethering_rounded,
              color: onlineCount > 0 ? kGreen : kAmber,
            ),
            if (_loading) const LoadingBlock(text: 'Checking operators...'),
            if (!_loading && _error != null) ErrorBlock(error: _error!, onRetry: () => _load()),
            if (!_loading && _error == null && _rows.isEmpty)
              const EmptyBlock(text: 'No operator presence found yet.'),
            for (final row in _rows)
              AppCard(
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: (row.online ? kGreen : kMuted).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        row.online ? Icons.check_circle_rounded : Icons.schedule_rounded,
                        color: row.online ? kGreen : kMuted,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row.name, style: const TextStyle(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 3),
                          Text('${row.role} | ${row.townName}', style: const TextStyle(color: kMuted)),
                          const SizedBox(height: 3),
                          Text('Last seen: ${row.lastSeenText}', style: const TextStyle(color: kMuted, fontSize: 12)),
                        ],
                      ),
                    ),
                    StatusPill(text: row.online ? 'online' : 'away', color: row.online ? kGreen : kAmber),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
