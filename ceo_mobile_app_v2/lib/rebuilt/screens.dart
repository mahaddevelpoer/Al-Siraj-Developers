import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart'; // Direct PDF viewing and sharing enabled

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
  bool _success = false;
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
      final role = profile.isEmpty
          ? 'ceo'
          : '${profile.first['role'] ?? ''}'.toLowerCase();
      if (role != 'ceo') throw Exception('Only CEO can use this app.');
      if (mounted) setState(() => _success = true);
      await Future.delayed(const Duration(milliseconds: 600));
      if (mounted) widget.onLoggedIn();
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
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.0, end: 1.0),
                duration: const Duration(milliseconds: 600),
                curve: Curves.easeOutCubic,
                builder: (context, value, child) {
                  return Opacity(
                    opacity: value,
                    child: Transform.translate(
                      offset: Offset(0, 30 * (1 - value)),
                      child: child,
                    ),
                  );
                },
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
                      style: TextStyle(
                        color: kMuted,
                        fontWeight: FontWeight.w700,
                      ),
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
                              style: const TextStyle(
                                color: kRed,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                          const SizedBox(height: 18),
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: FilledButton(
                              onPressed: (_busy || _success) ? null : _login,
                              style: FilledButton.styleFrom(
                                backgroundColor: _success ? kGreen : kBlue,
                              ),
                              child: _success
                                  ? const Icon(
                                      Icons.check_circle,
                                      color: Colors.white,
                                    )
                                  : _busy
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
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
        unawaited(
          repo.reviewNotificationAction(
            id: id,
            action: action,
            table: '${data['table'] ?? ''}',
          ),
        );
      }
      if (route == 'approvals' || route == 'appeals') setState(() => _tab = 1);
      if (route == 'reports' || route == 'daily_report')
        setState(() => _tab = 2);
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
      OverviewScreen(
        repo: repo,
        onOpenApprovals: () => setState(() => _tab = 1),
      ),
      ApprovalsScreen(repo: repo),
      ReportsScreen(repo: repo),
      AuditScreen(repo: repo),
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
              _NavItem(
                icon: Icons.dashboard_rounded,
                label: 'Home',
                selected: _tab == 0,
                onTap: () => setState(() => _tab = 0),
              ),
              _NavItem(
                icon: Icons.rule_rounded,
                label: 'Approvals',
                selected: _tab == 1,
                onTap: () => setState(() => _tab = 1),
              ),
              _NavItem(
                icon: Icons.receipt_long_rounded,
                label: 'Reports',
                selected: _tab == 2,
                onTap: () => setState(() => _tab = 2),
              ),
              _NavItem(
                icon: Icons.fact_check_rounded,
                label: 'Audit',
                selected: _tab == 3,
                onTap: () => setState(() => _tab = 3),
              ),
              _NavItem(
                icon: Icons.grid_view_rounded,
                label: 'More',
                selected: _tab == 4,
                onTap: () => setState(() => _tab = 4),
              ),
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
  const OverviewScreen({
    super.key,
    required this.repo,
    required this.onOpenApprovals,
  });
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
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 20,
                          ),
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
              MetricCard(
                label: 'Cash balance',
                value: money.format(data.cash),
                icon: Icons.account_balance_wallet_rounded,
                color: kBlue,
              ),
              MetricCard(
                label: 'Total received',
                value: money.format(data.received),
                icon: Icons.trending_up_rounded,
                color: kGreen,
              ),
              MetricCard(
                label: 'Total expenses',
                value: money.format(data.expenses),
                icon: Icons.trending_down_rounded,
                color: kRed,
              ),
              MetricCard(
                label: 'Pending collection',
                value: money.format(data.pendingCollection),
                icon: Icons.pending_actions_rounded,
                color: kAmber,
              ),
              const SizedBox(height: 8),
              const Text(
                'Towns',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
              ),
              const SizedBox(height: 10),
              if (data.towns.isEmpty)
                const EmptyBlock(text: 'No active towns found.'),
              for (final town in data.towns)
                AppCard(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            TownDashboardScreen(repo: widget.repo, town: town),
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
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 17,
                              ),
                            ),
                          ),
                          StatusPill(
                            text: '${town.pendingApprovals} pending',
                            color: town.pendingApprovals > 0 ? kAmber : kGreen,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Cash: ${money.format(town.cash)}',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Pending: ${money.format(town.pendingCollection)} | Sales: ${town.salesCount}',
                        style: const TextStyle(color: kMuted),
                      ),
                      const SizedBox(height: 8),
                      const Row(
                        children: [
                          Text(
                            'Open town dashboard',
                            style: TextStyle(
                              color: kBlue,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(width: 4),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: kBlue,
                          ),
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
  const TownDashboardScreen({
    super.key,
    required this.repo,
    required this.town,
  });
  final CeoRepository repo;
  final TownSummary town;

  @override
  State<TownDashboardScreen> createState() => _TownDashboardScreenState();
}

class _TownDashboardScreenState extends State<TownDashboardScreen> {
  DateTime _date = DateTime.now();
  late Future<TownDashboardDetail> _future = widget.repo.loadTownDashboard(
    widget.town.name,
    reportDate: _date,
  );

  Future<void> _refresh() async {
    setState(() {
      _future = widget.repo.loadTownDashboard(
        widget.town.name,
        reportDate: _date,
        force: true,
      );
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
      _future = widget.repo.loadTownDashboard(
        widget.town.name,
        reportDate: _date,
        force: true,
      );
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
                IconButton(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.calendar_month_rounded),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        summary.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 22,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Town dashboard | ${shortDate.format(_date)}',
                        style: const TextStyle(
                          color: kMuted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                if (snap.connectionState == ConnectionState.waiting &&
                    detail == null)
                  const LoadingBlock(text: 'Loading town dashboard...'),
                if (snap.hasError && detail == null)
                  ErrorBlock(error: snap.error!, onRetry: _refresh),
                MetricCard(
                  label: 'Cash balance',
                  value: money.format(summary.cash),
                  icon: Icons.account_balance_wallet_rounded,
                  color: kBlue,
                ),
                MetricCard(
                  label: 'Total received',
                  value: money.format(summary.received),
                  icon: Icons.south_west_rounded,
                  color: kGreen,
                ),
                MetricCard(
                  label: 'Total expenses',
                  value: money.format(summary.expenses),
                  icon: Icons.north_east_rounded,
                  color: kRed,
                ),
                MetricCard(
                  label: 'Pending collection',
                  value: money.format(summary.pendingCollection),
                  icon: Icons.pending_actions_rounded,
                  color: kAmber,
                ),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '8PM daily ledger receipt',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                        ),
                      ),
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
                        Text(
                          'Cash: ${money.format(receipt.cash)}',
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ],
                    ],
                  ),
                ),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pending approvals for this town',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if ((detail?.recentApprovals ?? const <ReviewItem>[])
                          .isEmpty)
                        const Text(
                          'No pending approvals for this town.',
                          style: TextStyle(color: kMuted),
                        ),
                      for (final item
                          in detail?.recentApprovals ?? const <ReviewItem>[])
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Row(
                            children: [
                              Icon(item.icon, color: kAmber),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  '${item.title} | ${money.format(item.amount)}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                  ),
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
        print(
          '[APPROVALS-UI] First row: id=${rows.first.id}, title=${rows.first.title}',
        );
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${item.title} $status')));
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
                _loading
                    ? 'Checking $_status approvals...'
                    : '${rows.length} $_status approvals found.',
                style: const TextStyle(color: kMuted),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _FilterChip(label: 'pending', value: _status, onTap: _change),
                  _FilterChip(
                    label: 'approved',
                    value: _status,
                    onTap: _change,
                  ),
                  _FilterChip(
                    label: 'rejected',
                    value: _status,
                    onTap: _change,
                  ),
                ],
              ),
            ],
          ),
        ),
        if (_loading) const LoadingBlock(text: 'Loading approvals...'),
        if (!_loading && isError) ErrorBlock(error: _error!, onRetry: _refresh),
        if (!_loading && !isError && rows.isEmpty)
          EmptyBlock(text: 'No $_status approvals.'),
        for (final item in rows)
          _ApprovalCard(
            item: item,
            status: _status,
            reviewing: _reviewing,
            onReview: _review,
          ),
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
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ),
              StatusPill(text: item.status, color: color),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Town: ${item.townName}',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            'By: ${item.accountantName} | ${item.dateText}',
            style: const TextStyle(color: kMuted),
          ),
          if (item.amount > 0) ...[
            const SizedBox(height: 4),
            Text(
              'Amount: ${money.format(item.amount)}',
              style: const TextStyle(color: kText),
            ),
          ],
          const SizedBox(height: 8),
          Text(item.summary, style: const TextStyle(color: kMuted)),
          if (status == 'pending') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: reviewing
                        ? null
                        : () => onReview(item, 'rejected'),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: reviewing
                        ? null
                        : () => onReview(item, 'approved'),
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
  const _FilterChip({
    required this.label,
    required this.value,
    required this.onTap,
  });
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
      labelStyle: TextStyle(
        color: selected ? kBlue : kMuted,
        fontWeight: FontWeight.w900,
      ),
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
  late Future<List<LedgerReceiptSummary>> _future = widget.repo
      .loadDailyReceipts(date: _date);

  Future<void> _refresh() async {
    setState(
      () => _future = widget.repo.loadDailyReceipts(date: _date, force: true),
    );
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
            IconButton(
              onPressed: _pickDate,
              icon: const Icon(Icons.calendar_month_rounded),
            ),
          ],
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '8PM daily report bundle',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'CEO receives one grouped notification when town receipts are ready.',
                    style: const TextStyle(
                      color: kMuted,
                      fontWeight: FontWeight.w700,
                    ),
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
                      Text(
                        shortDate.format(_date),
                        style: const TextStyle(
                          color: kText,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (snap.connectionState == ConnectionState.waiting && rows.isEmpty)
              const LoadingBlock(text: 'Loading daily receipts...'),
            if (snap.hasError && rows.isEmpty)
              ErrorBlock(error: snap.error!, onRetry: _refresh),
            if (rows.isEmpty &&
                !snap.hasError &&
                snap.connectionState != ConnectionState.waiting)
              const EmptyBlock(
                text:
                    'No 8PM receipt rows for this date yet. If a town was offline, it will appear after sync.',
              ),
            for (final row in rows)
              AppCard(
                onTap: () => _showReceipt(context, row),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.townName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 17,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text('Income: ${money.format(row.income)}'),
                    Text('Expense: ${money.format(row.expense)}'),
                    Text(
                      'Cash: ${money.format(row.cash)}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${row.rows.length} ledger rows | ${row.mediaRows.length} receipt files',
                      style: const TextStyle(color: kMuted),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Tap to preview receipt rows',
                      style: TextStyle(
                        color: kBlue,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
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
                  Text(
                    receipt.townName,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Daily ledger receipt | ${receipt.reportDate}',
                    style: const TextStyle(color: kMuted),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: () async {
                      try {
                        final bytes = await _generateReportPdfBytes(receipt);
                        if (!context.mounted) return;
                        showModalBottomSheet<void>(
                          context: context,
                          backgroundColor: kSurface,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(
                              top: Radius.circular(20),
                            ),
                          ),
                          builder: (context) {
                            return SafeArea(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const SizedBox(height: 12),
                                  Text(
                                    'PDF Report - ${receipt.townName}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                  const SizedBox(height: 12),
                                  ListTile(
                                    leading: const Icon(
                                      Icons.picture_as_pdf,
                                      color: Colors.green,
                                    ),
                                    title: const Text(
                                      'View / Print PDF',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    onTap: () async {
                                      Navigator.pop(context);
                                      await Printing.layoutPdf(
                                        onLayout: (_) async => bytes,
                                        name: 'Report_${receipt.townName}',
                                      );
                                    },
                                  ),
                                  ListTile(
                                    leading: const Icon(
                                      Icons.share,
                                      color: Colors.blue,
                                    ),
                                    title: const Text(
                                      'Share PDF',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    onTap: () async {
                                      Navigator.pop(context);
                                      await Printing.sharePdf(
                                        bytes: bytes,
                                        filename:
                                            'Report_${receipt.townName}_${receipt.reportDate}.pdf',
                                      );
                                    },
                                  ),
                                  const SizedBox(height: 12),
                                ],
                              ),
                            );
                          },
                        );
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to generate PDF: $e')),
                        );
                      }
                    },
                    icon: const Icon(Icons.picture_as_pdf_rounded),
                    label: const Text('Generate & Share PDF Report'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: kBlue,
                      foregroundColor: kSurface,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  MetricCard(
                    label: 'Income',
                    value: money.format(receipt.income),
                    icon: Icons.south_west_rounded,
                    color: kGreen,
                  ),
                  MetricCard(
                    label: 'Expense',
                    value: money.format(receipt.expense),
                    icon: Icons.north_east_rounded,
                    color: kRed,
                  ),
                  MetricCard(
                    label: 'Cash movement',
                    value: money.format(receipt.cash),
                    icon: Icons.account_balance_rounded,
                    color: kBlue,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Receipt rows',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                  ),
                  const SizedBox(height: 8),
                  if (receipt.mediaRows.isNotEmpty) ...[
                    const Text(
                      'Generated receipt files',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    for (final media in receipt.mediaRows)
                      AppCard(
                        padding: const EdgeInsets.all(12),
                        onTap: () => _handlePdfTap(context, media),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              textOf(
                                rowValue(media, 'Title') ?? media['title'],
                                'Daily ledger receipt',
                              ),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Builder(
                              builder: (context) {
                                final hasBase64 =
                                    (rowValue(media, 'Pdf_Base64') ??
                                            media['pdf_base64'] ??
                                            rowValue(media, 'Html_Content') ??
                                            media['html_content'] ??
                                            '')
                                        .toString()
                                        .isNotEmpty;
                                if (hasBase64) {
                                  return Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.green.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                        color: Colors.green.withOpacity(0.3),
                                      ),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.picture_as_pdf,
                                          size: 14,
                                          color: Colors.green,
                                        ),
                                        SizedBox(width: 4),
                                        Text(
                                          '📄 PDF Report Attached (Mobile Ready)',
                                          style: TextStyle(
                                            color: Colors.green,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }
                                return Text(
                                  textOf(
                                    rowValue(media, 'Pdf_Path') ??
                                        media['pdf_path'] ??
                                        rowValue(media, 'File_Path') ??
                                        media['file_path'],
                                    'PDF Report Sync Active',
                                  ),
                                  style: const TextStyle(color: kMuted),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 8),
                    const Text(
                      'Ledger rows',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (receipt.rows.isEmpty)
                    const EmptyBlock(
                      text: 'No entry rows inside this receipt yet.',
                    ),
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
                          Text(
                            textOf(
                              row['description'] ??
                                  rowValue(row, 'Description'),
                              'No description',
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            money.format(
                              asNum(row['amount'] ?? rowValue(row, 'Amount')),
                            ),
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              color: kBlue,
                            ),
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

  Future<Uint8List> _generateReportPdfBytes(
    LedgerReceiptSummary receipt,
  ) async {
    final pdf = pw.Document();

    // Custom font styling
    final theme = pw.ThemeData.withFont(
      base: await PdfGoogleFonts.interRegular(),
      bold: await PdfGoogleFonts.interBold(),
    );

    pdf.addPage(
      pw.MultiPage(
        theme: theme,
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (context) {
          return [
            // Header
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'AL SIRAJ DEVELOPERS',
                      style: pw.TextStyle(
                        fontSize: 22,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColors.blue900,
                      ),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text(
                      'Daily Ledger Report - ${receipt.townName}',
                      style: pw.TextStyle(
                        fontSize: 14,
                        fontWeight: pw.FontWeight.bold,
                        color: PdfColors.grey700,
                      ),
                    ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'Date: ${receipt.reportDate}',
                      style: const pw.TextStyle(fontSize: 11),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text(
                      'Generated on CEO Mobile App',
                      style: pw.TextStyle(
                        fontSize: 9,
                        color: PdfColors.grey500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            pw.Divider(thickness: 1.5, color: PdfColors.grey300),
            pw.SizedBox(height: 12),

            // Financial Summary
            pw.Text(
              'Financial Summary',
              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 6),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                _buildPdfSummaryCard(
                  'Total Income',
                  'PKR ${receipt.income.toStringAsFixed(0)}',
                  PdfColors.green800,
                ),
                _buildPdfSummaryCard(
                  'Total Expense',
                  'PKR ${receipt.expense.toStringAsFixed(0)}',
                  PdfColors.red800,
                ),
                _buildPdfSummaryCard(
                  'Net Cash Movement',
                  'PKR ${(receipt.income - receipt.expense).toStringAsFixed(0)}',
                  PdfColors.blue800,
                ),
              ],
            ),
            pw.SizedBox(height: 20),

            // Ledger Rows Table
            pw.Text(
              'Ledger Rows (${receipt.rows.length})',
              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
            ),
            pw.SizedBox(height: 6),
            pw.TableHelper.fromTextArray(
              headers: ['Type', 'Category', 'Description', 'Amount (PKR)'],
              data: receipt.rows.map((row) {
                final type = (row['type'] ?? row['Type'] ?? '').toString();
                final cat = (row['category'] ?? row['Category'] ?? '')
                    .toString();
                final desc = (row['description'] ?? row['Description'] ?? '')
                    .toString();
                final amt = (row['amount'] ?? row['Amount'] ?? 0).toString();
                return [type, cat, desc, amt];
              }).toList(),
              headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold,
                color: PdfColors.white,
              ),
              headerDecoration: const pw.BoxDecoration(
                color: PdfColors.blue900,
              ),
              rowDecoration: const pw.BoxDecoration(
                border: pw.Border(
                  bottom: pw.BorderSide(color: PdfColors.grey300),
                ),
              ),
              cellAlignment: pw.Alignment.centerLeft,
              cellAlignments: {3: pw.Alignment.centerRight},
            ),
          ];
        },
      ),
    );

    return pdf.save();
  }

  pw.Widget _buildPdfSummaryCard(String title, String val, PdfColor col) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(
        color: PdfColors.grey100,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
        border: pw.Border.all(color: PdfColors.grey300),
      ),
      width: 150,
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            title,
            style: pw.TextStyle(fontSize: 10, color: PdfColors.grey600),
          ),
          pw.SizedBox(height: 4),
          pw.Text(
            val,
            style: pw.TextStyle(
              fontSize: 12,
              fontWeight: pw.FontWeight.bold,
              color: col,
            ),
          ),
        ],
      ),
    );
  }

  void _handlePdfTap(BuildContext context, Map<String, dynamic> media) async {
    final title = (rowValue(media, 'Title') ?? media['title'] ?? 'PDF Report')
        .toString();
    final base64Str =
        (rowValue(media, 'Pdf_Base64') ??
                media['pdf_base64'] ??
                rowValue(media, 'Html_Content') ??
                media['html_content'] ??
                '')
            .toString();

    if (base64Str.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No PDF content attached to this report.'),
        ),
      );
      return;
    }

    try {
      final bytes = base64Decode(base64Str);
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: kSurface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (context) {
          return SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 12),
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const Icon(
                    Icons.picture_as_pdf,
                    color: Colors.green,
                  ),
                  title: const Text(
                    'View / Print PDF',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  onTap: () async {
                    Navigator.pop(context);
                    try {
                      await Printing.layoutPdf(
                        onLayout: (_) async => bytes,
                        name: title,
                      );
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to preview PDF: $e')),
                      );
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.share, color: Colors.blue),
                  title: const Text(
                    'Share PDF',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  onTap: () async {
                    Navigator.pop(context);
                    try {
                      await Printing.sharePdf(
                        bytes: bytes,
                        filename:
                            '${title.replaceAll(RegExp(r"[^\w\s\-]"), "_")}.pdf',
                      );
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to share PDF: $e')),
                      );
                    }
                  },
                ),
                const SizedBox(height: 12),
              ],
            ),
          );
        },
      );
    } catch (err) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Error loading PDF: $err')));
    }
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
  bool _lockerAuditEnabled = true;
  bool _loadingSettings = true;

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

    try {
      final settings = await widget.repo.loadSystemSettings();
      if (!mounted) return;
      setState(() {
        _lockerAuditEnabled = settings['locker_audit_enabled'] ?? true;
        _loadingSettings = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingSettings = false);
    }
  }

  Future<void> _toggleDeviceLock(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('biometric_enabled', enabled);
    if (mounted) setState(() => _deviceLockEnabled = enabled);
  }

  Future<void> _toggleLockerAudit(bool enabled) async {
    setState(() => _loadingSettings = true);
    try {
      await widget.repo.updateSystemSetting('locker_audit_enabled', enabled);
      if (mounted) setState(() => _lockerAuditEnabled = enabled);
    } catch (_) {}
    if (mounted) setState(() => _loadingSettings = false);
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
                MaterialPageRoute(
                  builder: (_) => WhoOnlineScreen(repo: widget.repo),
                ),
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
              _deviceLockEnabled
                  ? 'Fingerprint / PIN on app open'
                  : 'Fingerprint / PIN required for unlock',
            ),
            value: _deviceLockEnabled,
            onChanged: _loadingLock ? null : _toggleDeviceLock,
            contentPadding: EdgeInsets.zero,
          ),
        ),

        AppCard(
          child: SwitchListTile(
            secondary: const Icon(Icons.fact_check_rounded, color: kBlue),
            title: const Text('Enforce Locker Audits'),
            subtitle: const Text('Require physical cash match on audit day'),
            value: _lockerAuditEnabled,
            onChanged: _loadingSettings ? null : _toggleLockerAudit,
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
      final rows = await widget.repo.loadOperatorPresence().timeout(
        const Duration(seconds: 8),
        onTimeout: () => <OperatorPresence>[],
      );
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
            if (!_loading && _error != null)
              ErrorBlock(error: _error!, onRetry: () => _load()),
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
                        color:
                            (row.status == 'online'
                                    ? kGreen
                                    : (row.status == 'away' ? kAmber : kMuted))
                                .withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        row.status == 'online'
                            ? Icons.check_circle_rounded
                            : (row.status == 'away'
                                  ? Icons.schedule_rounded
                                  : Icons.remove_circle_outline_rounded),
                        color: row.status == 'online'
                            ? kGreen
                            : (row.status == 'away' ? kAmber : kMuted),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${row.role} | ${row.townName}',
                            style: const TextStyle(color: kMuted),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Last seen: ${row.lastSeenText}',
                            style: const TextStyle(color: kMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    StatusPill(
                      text: row.status,
                      color: row.status == 'online'
                          ? kGreen
                          : (row.status == 'away' ? kAmber : kMuted),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class TermsScreen extends StatefulWidget {
  final VoidCallback onAccept;
  const TermsScreen({super.key, required this.onAccept});

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  bool _checked = false;
  bool _scrolledToBottom = false;

  Widget _termsSection(String title, String body) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text(body, style: const TextStyle(color: kText, height: 1.4)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: kRed.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.security_rounded, color: kRed),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Software Terms & Legal',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Please read these terms carefully before using the software.',
                          style: TextStyle(color: kMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Expanded(
                child: AppCard(
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (ScrollNotification scrollInfo) {
                      if (!_scrolledToBottom &&
                          scrollInfo.metrics.pixels >=
                              scrollInfo.metrics.maxScrollExtent - 20) {
                        setState(() => _scrolledToBottom = true);
                      }
                      return true;
                    },
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: kRed.withValues(alpha: 0.05),
                              border: Border.all(
                                color: kRed.withValues(alpha: 0.2),
                              ),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: const [
                                Icon(
                                  Icons.warning_amber_rounded,
                                  color: kRed,
                                  size: 20,
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'READ CAREFULLY BEFORE CONTINUING',
                                    style: TextStyle(
                                      color: kRed,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _termsSection(
                            '1. Software Purpose',
                            'AL SIRAJ DEVELOPERS software is developed to help manage real-estate town operations, including towns, plots, shops, sales, installments, remaining payments, accounts, employees, salaries, investors, contractors, agents, receipts, reports, approvals, local Excel records, Supabase/cloud sync, and CEO monitoring. The software is intended to reduce calculation mistakes, improve transparency, maintain records, and help the owner monitor business activity. However, the software is a management and record-keeping tool only. Final business responsibility remains with the Client/Owner/CEO.',
                          ),
                          _termsSection(
                            '2. One-Year Service Support',
                            'The Developer will provide service support for one year from the date of final handover/installation. This includes fixing software bugs and errors, resolving calculation-related software issues, helping with normal software errors, improving or correcting existing features where required, and providing technical guidance for backup, sync, and usage. This support does not include new major modules not agreed in the original scope, hardware repair, internet service issues, third-party cloud provider outages, data manually altered outside the software, fraudulent activity by employees/accountants/agents/users, or loss caused by misuse, negligence, or wrong business entries. Any new feature, major redesign, extra mobile app feature, extra reporting system, or new business requirement may require separate charges and a separate agreement.',
                          ),
                          _termsSection(
                            '3. Data Storage and Backup',
                            'The software is designed as a local-first system. Business data may be stored locally through Excel-based files and may also sync with Supabase/cloud services where configured. Local Excel files act as an important local record/cache/backup. Cloud sync depends on internet, Supabase, correct configuration, and third-party service availability. Cloud-side data loss, cloud outage, failed sync, service restriction, account suspension, or third-party provider issue is not the Developer\'s responsibility. The Developer does not provide an absolute guarantee of zero data loss. The Client must maintain regular backups including software data records, local Excel backups, external drive/USB backups, printed reports where required, and handwritten/manual hard records for important business transactions. The software should not be treated as the only record of the business.',
                          ),
                          _termsSection(
                            '4. No Absolute Data Loss Guarantee',
                            'The Developer will make reasonable efforts to design the software safely and fix errors/bugs during the service period. However, the Developer does not guarantee that data loss can never occur. Data loss or mismatch may happen due to cloud service failure, internet failure, power failure, system crash, hard disk/SSD failure, Windows corruption, virus or malware, manual deletion of files, wrong use of cleanup scripts, manual editing of Excel/database files, third-party software interference, Supabase or storage provider issue, multiple PCs syncing with conflicting data, or user negligence/misuse. The Developer will help resolve software errors where possible, but the Developer is not financially responsible for business loss, profit loss, property loss, cloud data loss, or loss caused by missing backups.',
                          ),
                          _termsSection(
                            '5. Employee, Accountant, Agent, or User Fraud',
                            'The software is built to help reduce fraud and manipulation through records, approvals, audit logs, reports, local storage, and CEO monitoring. However, the Developer is not responsible if any accountant, employee, agent, contractor, investor, operator, or other user enters wrong values intentionally, manipulates entries, hides information from the owner, uses another person\'s login, shares passwords, deletes or changes files outside the software, alters local Excel files manually, misuses offline mode, misuses approval/pending systems, or enters fake receipts or fake records. The Client/Owner/CEO is responsible for staff supervision, accountant monitoring, user permissions, password protection, device security, office discipline, manual verification, and regular audit of reports and accounts. The software can assist in detecting and reducing fraud, but it cannot replace business supervision and legal/accounting control.',
                          ),
                          _termsSection(
                            '6. Manual Alteration of Local Data',
                            'If any user manually opens, edits, deletes, renames, moves, corrupts, or alters local Excel files, app data files, reports, receipts, configuration files, or synced records outside the software, the Developer will not be responsible for any resulting error, mismatch, data loss, wrong balance, wrong receipt, wrong report, or sync issue. Manual alteration of local data may void support for the affected records unless the Developer is able to repair them separately.',
                          ),
                          _termsSection(
                            '7. Cloud Sync Disclaimer',
                            'Cloud sync is provided for convenience, backup, monitoring, and CEO mobile app connectivity. Cloud sync depends on third-party services such as Supabase, internet connection, device availability, correct credentials, and proper configuration. The Developer is not responsible for Supabase outage, cloud storage failure, internet failure, failed upload/download caused by network issues, third-party policy changes, account suspension, cloud-side deletion by the Client or their staff, incorrect cloud credentials, delayed sync, or conflicting records created from multiple devices. If cloud sync fails, the software may still save data locally where possible. The Client must regularly verify sync status and backups.',
                          ),
                          _termsSection(
                            '8. Offline Mode Disclaimer',
                            'The software may support offline work so that the accountant can continue entries when internet is unavailable. Offline data must be synced later when internet is available. Some approval-related actions may remain pending until internet is connected. Pending approvals or unsynced records must be reviewed regularly. The Client/CEO must ensure internet is connected when approvals, reports, or cloud sync are required. Offline mode should not be misused to hide or delay important data. The Developer is not responsible for loss caused by the Client\'s failure to connect internet, verify pending sync, review pending approvals, or maintain backups.',
                          ),
                          _termsSection(
                            '9. Approval and Pending System',
                            'Approval systems are designed to reduce manipulation in sensitive actions such as date changes, backdated/future entries, suspicious edits, investor entries, construction entries, and other important changes. Pending items should be reviewed by the CEO/authorized person. Rejected items should not affect totals. Approved items may affect records according to business rules. The CEO/Owner is responsible for reviewing approvals carefully. If the CEO approves a wrong or fraudulent request, the Developer is not responsible for the resulting business loss.',
                          ),
                          _termsSection(
                            '10. Receipts, Reports, and Financial Records',
                            'Receipts and reports are generated based on the data entered into the software. If wrong data is entered by the user, wrong reports or receipts may be generated. The Developer is not responsible for wrong receipts caused by wrong entries, wrong reports caused by user-entered false data, business decisions made without verification, handwritten record mismatch, or failure to print, save, or backup receipts/reports. The Client should verify important receipts, agreements, payments, balances, and reports manually.',
                          ),
                          _termsSection(
                            '11. Security Responsibilities',
                            'The Developer will make reasonable efforts to improve software security, including role permissions, audit logs, sync safety, and restricted access. The Client is responsible for keeping devices secure, using strong passwords, not sharing login credentials, restricting accountant/employee access, protecting Windows user accounts, preventing unauthorized file access, preventing malware/virus infection, keeping backups, and keeping internet and cloud accounts secure. The Developer is not responsible for losses caused by weak passwords, shared logins, stolen devices, unauthorized access, virus/malware, or poor office security.',
                          ),
                          _termsSection(
                            '12. Third-Party Services',
                            'The software may use third-party services, including but not limited to Supabase, Firebase Cloud Messaging, internet services, Windows, PDF tools, storage services, and other libraries/tools. The Developer is not responsible for third-party downtime, pricing changes, service limits, API changes, account bans/suspensions, security incidents caused by third-party platforms, or any policy changes by third-party providers.',
                          ),
                          _termsSection(
                            '13. Client\'s Duty to Verify',
                            'The Client/Owner/CEO must regularly verify cash in hand, bank balances, property sales, installments, remaining amounts, salary payments, investor records, contractor payments, agent commissions, receipts, reports, sync status, pending approvals, and backups. The software helps organize and display records, but the Client remains responsible for final verification and business decisions.',
                          ),
                          _termsSection(
                            '14. Limitation of Liability',
                            'To the maximum extent permitted by law, the Developer shall not be liable for business loss, profit loss, property loss, cloud data loss, employee fraud, accountant fraud, manual data alteration, loss due to missing backups, wrong business decisions, third-party service failure, internet failure, hardware/software failure outside the Developer\'s control, or indirect, special, accidental, or consequential damages. The Developer\'s responsibility is limited to fixing software bugs/errors within the agreed one-year service period, where the issue is caused by the software and not by misuse, third-party failure, employee fraud, manual alteration, or lack of backup.',
                          ),
                          _termsSection(
                            '15. Backup Recommendation',
                            'The Client is strongly advised to maintain regular backups, including daily or weekly local backup, external drive/USB backup, cloud backup where possible, printed/hard copy of important reports, and handwritten/manual register for critical financial/property transactions. The Developer recommends that the Client should not depend only on software records for high-value business matters.',
                          ),
                          _termsSection(
                            '16. Maintenance and Updates',
                            'During the one-year service period, the Developer may provide fixes, improvements, and updates as required. The Client should not install unofficial modified versions of the software. Any unauthorized modification, reverse engineering, file tampering, or manual code change may void support.',
                          ),
                          _termsSection(
                            '17. Scope of Responsibility',
                            'The Developer is responsible for software development according to agreed scope, bug fixing during the service period, technical support for software-related issues, and reasonable help in resolving errors. The Developer is not responsible for employee/accountant honesty, business supervision, legal disputes between parties, manual fraud, third-party failures, cloud provider issues, hardware/device failure, internet problems, or data loss caused by missing backups or misuse.',
                          ),
                          _termsSection(
                            '18. Acceptance',
                            'By installing, using, or continuing to use AL SIRAJ DEVELOPERS software, the Client confirms that they understand the software is a management and record-keeping tool, that no absolute data loss guarantee is provided, that cloud-side loss or third-party failure is not the Developer\'s responsibility, that employee/accountant fraud is the Client/Owner\'s responsibility, that they agree to maintain backups and hard/manual records, and that they agree the Developer\'s role is limited to software support and bug fixing as described in these terms.',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              CheckboxListTile(
                value: _checked,
                onChanged: _scrolledToBottom
                    ? (val) => setState(() => _checked = val ?? false)
                    : null,
                title: Text(
                  'I have read and understood the Terms and Conditions and agree to them in full.',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: _scrolledToBottom ? kText : kMuted,
                  ),
                ),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                activeColor: kBlue,
              ),
              if (!_scrolledToBottom)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    '(Scroll to the bottom to agree)',
                    style: TextStyle(color: kRed, fontSize: 12),
                  ),
                ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: _checked ? widget.onAccept : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: _checked ? kBlue : kMuted,
                  ),
                  child: const Text(
                    'I AGREE AND ACCEPT',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AuditScreen extends StatefulWidget {
  const AuditScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> {
  late Future<List<LockerAudit>> _auditsFuture = widget.repo.loadLockerAudits();
  late Future<List<AuditSchedule>> _schedulesFuture = widget.repo
      .loadAuditSchedules();
  late Future<DashboardSummary> _dashboardFuture = widget.repo.loadDashboard();
  bool _busy = false;

  Future<void> _refresh() async {
    setState(() {
      _auditsFuture = widget.repo.loadLockerAudits();
      _schedulesFuture = widget.repo.loadAuditSchedules();
      _dashboardFuture = widget.repo.loadDashboard(force: true);
    });
    await Future.wait([_auditsFuture, _schedulesFuture, _dashboardFuture]);
  }

  Future<void> _scheduleNewAudit(String townName) async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
      initialDate: DateTime.now(),
    );
    if (picked == null) return;

    setState(() => _busy = true);
    try {
      await widget.repo.scheduleAudit(townName, picked);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Audit scheduled for $townName on ${picked.toIso8601String().split('T')[0]}!',
            ),
          ),
        );
      }
      await _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to schedule audit: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showReportDetails(LockerAudit audit) {
    showModalBottomSheet(
      context: context,
      backgroundColor: kSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        final mismatch = audit.discrepancy != 0;
        return Container(
          padding: const EdgeInsets.all(24),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Audit Report: ${audit.townName}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 20,
                        color: kText,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Date: ${audit.auditDate} | Audited by: ${audit.auditedBy}',
                  style: const TextStyle(
                    color: kMuted,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Divider(height: 32, color: kLine),

                // Numbers summary
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: kLine.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'System Cash',
                              style: TextStyle(fontSize: 12, color: kMuted),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              money.format(audit.systemBalance),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: kLine.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Locker Physical',
                              style: TextStyle(fontSize: 12, color: kMuted),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              money.format(audit.physicalBalance),
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Discrepancy indicator
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: mismatch
                        ? kRed.withValues(alpha: 0.1)
                        : kGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: mismatch ? kRed : kGreen,
                      width: 1.5,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        mismatch
                            ? Icons.warning_amber_rounded
                            : Icons.check_circle_outline_rounded,
                        color: mismatch ? kRed : kGreen,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              mismatch
                                  ? 'Locker Discrepancy Detected!'
                                  : 'Locker Balances Match Perfectly',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                color: mismatch ? kRed : kGreen,
                                fontSize: 15,
                              ),
                            ),
                            if (mismatch) ...[
                              const SizedBox(height: 4),
                              Text(
                                'Difference: ${money.format(audit.discrepancy)}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: kRed,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Detailed sections from report
                const Text(
                  'Audit Breakdown',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
                const SizedBox(height: 12),

                _buildReportRow(
                  'Active Sales Count',
                  '${audit.report['activeSalesCount'] ?? 0}',
                ),
                _buildReportRow(
                  'Expected Sales Revenue',
                  money.format(audit.report['expectedRevenue'] ?? 0),
                ),
                _buildReportRow(
                  'Actual Collected Amount',
                  money.format(audit.report['collectedAmount'] ?? 0),
                ),
                _buildReportRow(
                  'Uncollected Balance',
                  money.format(audit.report['remainingRevenue'] ?? 0),
                ),
                _buildReportRow(
                  'Recorded Expenses',
                  money.format(audit.report['recordedExpenses'] ?? 0),
                ),
                _buildReportRow(
                  'Employee Salary Payments',
                  money.format(audit.report['recordedSalaries'] ?? 0),
                ),

                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildReportRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: kMuted, fontWeight: FontWeight.w600),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold, color: kText),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ScreenScaffold(
      title: 'Audit command center',
      onRefresh: _refresh,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Locker & System Audit',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
              ),
              SizedBox(height: 4),
              Text(
                'Schedule physical cash matching audits and view discrepancy reports.',
                style: TextStyle(color: kMuted),
              ),
            ],
          ),
        ),

        // 1. Audit Schedule / Reminders Section
        const SizedBox(height: 10),
        const Text(
          'Schedule Reminders',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
        const SizedBox(height: 10),

        FutureBuilder<DashboardSummary>(
          future: _dashboardFuture,
          builder: (context, snap) {
            final towns = snap.data?.towns ?? const [];
            if (towns.isEmpty) return const SizedBox.shrink();
            return AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Select Town to Schedule Audit',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: kMuted,
                    ),
                  ),
                  const Divider(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: towns.map((town) {
                      return ActionChip(
                        avatar: const Icon(Icons.add_alarm_rounded, size: 16),
                        label: Text(town.name),
                        onPressed: _busy
                            ? null
                            : () => _scheduleNewAudit(town.name),
                      );
                    }).toList(),
                  ),
                ],
              ),
            );
          },
        ),

        // Pending schedules list
        FutureBuilder<List<AuditSchedule>>(
          future: _schedulesFuture,
          builder: (context, snap) {
            final list = (snap.data ?? const [])
                .where((s) => s.status == 'pending')
                .toList();
            if (list.isEmpty) return const SizedBox.shrink();
            return AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Pending Audit Dates',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: kMuted,
                    ),
                  ),
                  const Divider(height: 16),
                  for (final s in list)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.today_rounded,
                                size: 16,
                                color: kAmber,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                s.townName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          StatusPill(text: s.scheduledDate, color: kAmber),
                        ],
                      ),
                    ),
                ],
              ),
            );
          },
        ),

        // 2. Audit Reports Section
        const SizedBox(height: 18),
        const Text(
          'Completed Audits & Reports',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
        const SizedBox(height: 10),

        FutureBuilder<List<LockerAudit>>(
          future: _auditsFuture,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const LoadingBlock(text: 'Loading audit reports...');
            }
            if (snap.hasError) {
              return ErrorBlock(error: snap.error!, onRetry: _refresh);
            }
            final list = snap.data ?? const [];
            if (list.isEmpty) {
              return const EmptyBlock(
                text: 'No completed locker audits found.',
              );
            }
            return Column(
              children: list.map((audit) {
                final mismatch = audit.discrepancy != 0;
                return AppCard(
                  onTap: () => _showReportDetails(audit),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: mismatch
                              ? kRed.withValues(alpha: 0.1)
                              : kGreen.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          mismatch
                              ? Icons.warning_rounded
                              : Icons.check_circle_rounded,
                          color: mismatch ? kRed : kGreen,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              audit.townName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Date: ${audit.auditDate} | By: ${audit.auditedBy}',
                              style: const TextStyle(
                                color: kMuted,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              mismatch
                                  ? 'Discrepancy: ${money.format(audit.discrepancy)}'
                                  : 'Balances Match',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                                color: mismatch ? kRed : kGreen,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: kMuted),
                    ],
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}
