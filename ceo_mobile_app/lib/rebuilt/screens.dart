import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
      if (!mounted) return;
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

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key, required this.repo});
  final CeoRepository repo;

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  String _status = 'pending';
  late Future<List<ReviewItem>> _future = widget.repo.loadReviews(_status);
  bool _reviewing = false;

  Future<void> _refresh({bool force = true}) async {
    setState(() => _future = widget.repo.loadReviews(_status, force: force));
    await _future;
  }

  void _change(String status) {
    setState(() {
      _status = status;
      _future = widget.repo.loadReviews(status, force: true);
    });
  }

  Future<void> _review(ReviewItem item, String status) async {
    setState(() => _reviewing = true);
    try {
      await widget.repo.review(item, status);
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
    return FutureBuilder<List<ReviewItem>>(
      future: _future,
      builder: (context, snap) {
        final rows = snap.data ?? const <ReviewItem>[];
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
                  const Text(
                    'Pending requests load through a fresh simple path. No old heavy pending UI is used.',
                    style: TextStyle(color: kMuted),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    children: [
                      _FilterChip(label: 'pending', value: _status, onTap: _change),
                      _FilterChip(label: 'approved', value: _status, onTap: _change),
                      _FilterChip(label: 'rejected', value: _status, onTap: _change),
                    ],
                  ),
                ],
              ),
            ),
            if (snap.connectionState == ConnectionState.waiting && rows.isEmpty)
              const LoadingBlock(text: 'Loading approvals...'),
            if (snap.hasError && rows.isEmpty)
              ErrorBlock(error: snap.error!, onRetry: _refresh),
            if (rows.isEmpty && !snap.hasError && snap.connectionState != ConnectionState.waiting)
              EmptyBlock(text: 'No $_status approvals.'),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: rows.length,
              itemBuilder: (context, index) {
                final item = rows[index];
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
                      if (_status == 'pending') ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _reviewing ? null : () => _review(item, 'rejected'),
                                icon: const Icon(Icons.close_rounded),
                                label: const Text('Reject'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _reviewing ? null : () => _review(item, 'approved'),
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
              },
            ),
          ],
        );
      },
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
                  const Text('Daily ledger receipts', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
                  const SizedBox(height: 6),
                  Text(shortDate.format(_date), style: const TextStyle(color: kMuted, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            if (snap.connectionState == ConnectionState.waiting && rows.isEmpty)
              const LoadingBlock(text: 'Loading daily receipts...'),
            if (snap.hasError && rows.isEmpty)
              ErrorBlock(error: snap.error!, onRetry: _refresh),
            if (rows.isEmpty && !snap.hasError && snap.connectionState != ConnectionState.waiting)
              const EmptyBlock(text: 'No daily receipt rows for this date.'),
            for (final row in rows)
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.townName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                    const SizedBox(height: 8),
                    Text('Income: ${money.format(row.income)}'),
                    Text('Expense: ${money.format(row.expense)}'),
                    Text('Cash: ${money.format(row.cash)}', style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Text('${row.rows.length} ledger rows', style: const TextStyle(color: kMuted)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key, required this.repo});
  final CeoRepository repo;

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
