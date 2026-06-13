import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const supabaseUrl = 'https://wdislbdftnwmaexqtfmn.supabase.co';
const _fullAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc';
const ceoPushTopic = 'ceo-alerts';
const pushFreshnessWindow = Duration(minutes: 5);

final appNavigatorKey = GlobalKey<NavigatorState>();
final selectedTabNotifier = ValueNotifier<int>(0);
final appStartedAt = DateTime.now();

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  await Supabase.initialize(url: supabaseUrl, anonKey: _fullAnonKey);
  await CeoNotificationService.init();
  runApp(const CeoMobileApp());
}

final supabase = Supabase.instance.client;
final money = NumberFormat.currency(locale: 'en_PK', symbol: 'PKR ', decimalDigits: 0);
final shortDate = DateFormat('dd MMM yyyy');

class CeoMobileApp extends StatelessWidget {
  const CeoMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF0F766E);
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'AL SIRAJ DEVELOPERS',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.light),
        scaffoldBackgroundColor: const Color(0xFFF4F7F6),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        ),
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  Session? _session;

  @override
  void initState() {
    super.initState();
    _session = supabase.auth.currentSession;
    supabase.auth.onAuthStateChange.listen((event) {
      if (mounted) setState(() => _session = event.session);
    });
  }

  @override
  Widget build(BuildContext context) {
    return _session == null ? const LoginScreen() : const CeoShell();
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = await supabase.auth.signInWithPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
      final id = auth.user?.id;
      if (id == null) throw const AuthException('Login failed');
      final profile = await supabase.from('users').select('role,is_active').eq('id', id).single();
      if (profile['role'] != 'ceo' || profile['is_active'] != true) {
        await supabase.auth.signOut();
        throw const AuthException('Only active CEO accounts can use this app.');
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('AuthException(message: ', '').replaceAll(')', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          children: [
            const SizedBox(height: 12),
            const VectorBadge(kind: BadgeKind.brand, size: 72),
            const SizedBox(height: 18),
            LayoutBuilder(
              builder: (context, constraints) => Text(
                'AL SIRAJ DEVELOPERS',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: constraints.maxWidth < 330 ? 22 : 26, fontWeight: FontWeight.w900),
              ),
            ),
            const SizedBox(height: 8),
            const Text('CEO command center for approvals, alerts, balances, and town performance.'),
            const SizedBox(height: 22),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'CEO email', prefixIcon: Icon(Icons.mail_outline))),
            const SizedBox(height: 14),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline))),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 22),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: _busy ? null : _login,
              icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.login),
              label: const Text('Enter CEO App'),
            ),
            const SizedBox(height: 18),
            const Text('Read-only for towns, prices, plots and shops. Approval actions are limited to appeals and daily-entry reviews.', style: TextStyle(color: Color(0xFF64748B))),
          ],
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
  int _tab = 0;
  String _pushStatus = 'Checking push setup...';
  String _realtimeStatus = 'Connecting realtime...';
  final pages = const [OverviewPage(), AppealsPage(), DailyEntriesPage(), MorePage()];
  final List<dynamic> _channels = [];
  StreamSubscription<RemoteMessage>? _foregroundPushSub;
  StreamSubscription<RemoteMessage>? _openedPushSub;

  @override
  void initState() {
    super.initState();
    selectedTabNotifier.addListener(_applySelectedTab);
    _verifyCeoAndEnablePush();
    _listenForFcmMessages();
    _routeInitialPushMessage();
    _subscribeToLiveAlerts();
  }

  void _applySelectedTab() {
    if (mounted && _tab != selectedTabNotifier.value) {
      setState(() => _tab = selectedTabNotifier.value);
    }
  }

  Future<void> _verifyCeoAndEnablePush() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      final profile = await supabase.from('users').select('role,is_active').eq('id', userId).single();
      if (profile['role'] != 'ceo' || profile['is_active'] != true) {
        await FirebaseMessaging.instance.unsubscribeFromTopic(ceoPushTopic);
        await supabase.auth.signOut();
        return;
      }

      await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
      await FirebaseMessaging.instance.subscribeToTopic(ceoPushTopic);
      final token = await FirebaseMessaging.instance.getToken();
      if (mounted) {
        setState(() {
          _pushStatus = token == null || token.isEmpty
              ? 'Push token missing'
              : 'Push ready: ${token.substring(0, 10)}...';
        });
      }
    } catch (_) {
      await FirebaseMessaging.instance.unsubscribeFromTopic(ceoPushTopic).catchError((_) {});
      if (mounted) setState(() => _pushStatus = 'Push setup failed. Re-login and allow notifications.');
    }
  }

  void _listenForFcmMessages() {
    _foregroundPushSub = FirebaseMessaging.onMessage.listen((message) async {
      final shown = await CeoNotificationService.showFromRemoteMessage(message);
      if (shown) routeFromPushData(message.data);
    });

    _openedPushSub = FirebaseMessaging.onMessageOpenedApp.listen((message) {
      routeFromPushData(message.data);
    });
  }

  Future<void> _routeInitialPushMessage() async {
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) routeFromPushData(initial.data);
  }

  void _subscribeToLiveAlerts() {
    final channel = supabase
        .channel('ceo-mobile-live-alerts')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'appeals',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'all_sales',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'properties',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'installments',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'expenses',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'notifications',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'daily_entries',
          callback: (payload) {
            if (mounted) setState(() {});
          },
        )
        .subscribe((status, error) {
          if (!mounted) return;
          setState(() {
            _realtimeStatus = error == null ? 'Realtime: $status' : 'Realtime error: $error';
          });
        });
    _channels.add(channel);
  }

  @override
  void dispose() {
    selectedTabNotifier.removeListener(_applySelectedTab);
    _foregroundPushSub?.cancel();
    _openedPushSub?.cancel();
    for (final channel in _channels) {
      supabase.removeChannel(channel);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: const [
            VectorBadge(kind: BadgeKind.brand, size: 30),
            SizedBox(width: 9),
            Flexible(
              child: Text(
                'AL SIRAJ DEVELOPERS',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Logout',
            onPressed: () => supabase.auth.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, animation) {
            final offset = Tween<Offset>(begin: const Offset(0.03, 0), end: Offset.zero).animate(animation);
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(position: offset, child: child),
            );
          },
          child: KeyedSubtree(
            key: ValueKey(_tab),
            child: _tab == 0
                ? OverviewPage(pushStatus: _pushStatus, realtimeStatus: _realtimeStatus)
                : pages[_tab],
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        height: 62,
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_customize_outlined), selectedIcon: Icon(Icons.dashboard_customize), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.rule_outlined), selectedIcon: Icon(Icons.rule), label: 'Approvals'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Entries'),
          NavigationDestination(icon: Icon(Icons.apps_outlined), selectedIcon: Icon(Icons.apps), label: 'More'),
        ],
      ),
    );
  }
}

class OverviewPage extends StatelessWidget {
  const OverviewPage({super.key, this.pushStatus = '', this.realtimeStatus = ''});
  final String pushStatus;
  final String realtimeStatus;

  Future<Map<String, dynamic>> _load() async {
    final appeals = await supabase.from('appeals').select('id').eq('status', 'pending');
    final notes = await supabase.from('notifications').select('id').eq('dismissed', 'No');
    final entries = await supabase.from('daily_entries').select();
    final towns = await supabase.from('towns').select('town_name,profit_loss,total_income_pkr,total_expenses_pkr');
    final sales = await supabase.from('all_sales').select('total_amount_pkr,received_amount,remaining_amount,status');
    final rows = List<Map<String, dynamic>>.from(entries);
    final income = rows.where((e) => rowVal(e, 'Type') == 'Income').fold<num>(0, (s, e) => s + asNum(rowVal(e, 'Amount')));
    final expense = rows.where((e) => rowVal(e, 'Type') == 'Expense').fold<num>(0, (s, e) => s + asNum(rowVal(e, 'Amount')));
    final saleRows = List<Map<String, dynamic>>.from(sales);
    final soldValue = saleRows.fold<num>(0, (s, e) => s + asNum(rowVal(e, 'Total_Amount_PKR')));
    return {
      'appeals': appeals.length,
      'notes': notes.length,
      'income': income,
      'expense': expense,
      'towns': towns.length,
      'sales': sales.length,
      'soldValue': soldValue,
    };
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => (context as Element).markNeedsBuild(),
      child: FutureBuilder<Map<String, dynamic>>(
        future: _load(),
        builder: (context, snap) {
          final d = snap.data;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const HeaderBlock(title: 'Live business pulse', subtitle: 'Fast CEO overview from Supabase. No town, price, plot or shop editing exists in this mobile app.'),
              StatusStrip(items: [pushStatus, realtimeStatus].where((e) => e.trim().isNotEmpty).toList()),
              MetricGrid(metrics: [
                Metric('Pending appeals', '${d?['appeals'] ?? '-'}', Icons.rule, const Color(0xFF2563EB)),
                Metric('Active alerts', '${d?['notes'] ?? '-'}', Icons.notifications_active, const Color(0xFFB45309)),
                Metric('Net balance', d == null ? '-' : money.format(d['income'] - d['expense']), Icons.account_balance_wallet, const Color(0xFF0F766E)),
                Metric('Sales value', d == null ? '-' : money.format(d['soldValue']), Icons.sell, const Color(0xFF7C3AED)),
                Metric('Sales count', '${d?['sales'] ?? '-'}', Icons.receipt_long, const Color(0xFFBE123C)),
                Metric('Towns tracked', '${d?['towns'] ?? '-'}', Icons.location_city, const Color(0xFF475569)),
              ]),
            ],
          );
        },
      ),
    );
  }
}

class ActivityPage extends StatelessWidget {
  const ActivityPage({super.key});

  Future<Map<String, List<Map<String, dynamic>>>> _load() async {
    final sales = await supabase.from('all_sales').select('*').order('created_at', ascending: false).limit(40);
    final entries = await supabase.from('daily_entries').select('*').order('date', ascending: false).limit(40);
    final expenses = await supabase.from('expenses').select('*').order('date', ascending: false).limit(40);
    return {
      'sales': List<Map<String, dynamic>>.from(sales),
      'entries': List<Map<String, dynamic>>.from(entries),
      'expenses': List<Map<String, dynamic>>.from(expenses),
    };
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, List<Map<String, dynamic>>>>(
      future: _load(),
      builder: (context, snap) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Live activity', subtitle: 'Recent sales, accountant entries, and expenses synced from Supabase.'),
          if (snap.hasError) ErrorBlock(error: '${snap.error}'),
          if (!snap.hasData && !snap.hasError) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())),
          for (final s in snap.data?['sales'] ?? [])
            InfoCard(
              title: 'Sale - ${money.format(asNum(rowVal(s, 'Total_Amount_PKR')))}',
              subtitle: '${rowVal(s, 'Town_Name') ?? 'Town'} - ${rowVal(s, 'Type') ?? ''} ${rowVal(s, 'Plot_Shop_Number') ?? ''}',
              meta: '${formatDate(rowVal(s, 'Sell_Date'))} - ${rowVal(s, 'Status') ?? 'Sold'}',
              body: 'Agent: ${rowVal(s, 'Agent_Name') ?? '-'}',
            ),
          for (final e in snap.data?['entries'] ?? [])
            InfoCard(
              title: '${rowVal(e, 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(e, 'Amount')))}',
              subtitle: '${rowVal(e, 'Town_Name') ?? 'Town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: formatDate(rowVal(e, 'Date')),
              body: '${rowVal(e, 'Description') ?? ''}',
            ),
          for (final e in snap.data?['expenses'] ?? [])
            InfoCard(
              title: 'Expense - ${money.format(asNum(rowVal(e, 'Amount_PKR')))}',
              subtitle: '${rowVal(e, 'Town_Name') ?? 'Town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: formatDate(rowVal(e, 'Date')),
              body: '${rowVal(e, 'Expense_Name') ?? rowVal(e, 'Description') ?? ''}',
            ),
          if (snap.hasData && (snap.data!['sales']!.isEmpty && snap.data!['entries']!.isEmpty && snap.data!['expenses']!.isEmpty)) const EmptyBlock(text: 'No activity found.'),
        ],
      ),
    );
  }
}

class AppealsPage extends StatefulWidget {
  const AppealsPage({super.key});

  @override
  State<AppealsPage> createState() => _AppealsPageState();
}

class _AppealsPageState extends State<AppealsPage> {
  bool _reviewing = false;
  String _filter = 'pending';
  List<Map<String, dynamic>>? _items;
  Object? _error;

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('appeals').select('*, requested_by_user_id(full_name,email,agent_town)').eq('status', _filter).order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(data);
  }

  Future<void> _refresh() async {
    try {
      final rows = await _load();
      if (mounted) {
        setState(() {
          _items = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyDbError(e));
    }
  }

  Future<void> _review(String id, String status) async {
    setState(() => _reviewing = true);
    try {
      final result = await supabase.rpc('ceo_review_appeal', params: {
        'appeal_id': id,
        'new_status': status,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Appeal $status: ${result?['message'] ?? 'done'}')));
        setState(() => _items = (_items ?? []).where((item) => item['id'] != id).toList());
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Review failed: ${friendlyDbError(e)}'), backgroundColor: const Color(0xFFB91C1C)));
      }
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _items == null && _error == null ? _load() : Future.value(_items ?? const <Map<String, dynamic>>[]),
      builder: (context, snap) {
        if (snap.hasData && _items == null) {
          _items = snap.data;
        }
        final rows = _items ?? snap.data ?? const <Map<String, dynamic>>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Approvals', subtitle: 'Review agent registration, daily-entry, salary, and business requests.'),
          FilterChips(
            value: _filter,
            options: const ['pending', 'approved', 'rejected'],
            onChanged: (next) => setState(() {
              _filter = next;
              _items = null;
              _error = null;
            }),
          ),
          if (_error != null) ErrorBlock(error: 'Schema/API issue: $_error'),
          if (!snap.hasData && _error == null) const SkeletonList(),
          for (var i = 0; i < rows.length; i++)
            AnimatedEntry(
              index: i,
              child: InfoCard(
              icon: badgeForStatus(_filter),
              status: _filter,
              title: pretty(rows[i]['appeal_type']),
              subtitle: '${rows[i]['entity_type'] ?? ''} ${rows[i]['entity_id'] ?? ''}',
              meta: '${rows[i]['requested_by_user_id']?['full_name'] ?? 'User'} - ${formatDate(rows[i]['created_at'])}',
              body: safeSummary(rows[i]['reason'] ?? rows[i]['requested_data']),
              actions: [
                if (_filter == 'pending') ...[
                  OutlinedButton.icon(onPressed: _reviewing ? null : () => _review(rows[i]['id'], 'rejected'), icon: const Icon(Icons.close), label: const Text('Reject')),
                  FilledButton.icon(onPressed: _reviewing ? null : () => _review(rows[i]['id'], 'approved'), icon: const Icon(Icons.check), label: const Text('Approve')),
                ],
              ],
            ),
            ),
          if (snap.hasData && rows.isEmpty && _error == null) EmptyBlock(text: 'No $_filter appeals.'),
        ],
          ),
        );
      },
    );
  }
}

class DailyEntriesPage extends StatefulWidget {
  const DailyEntriesPage({super.key});

  @override
  State<DailyEntriesPage> createState() => _DailyEntriesPageState();
}

class _DailyEntriesPageState extends State<DailyEntriesPage> {
  bool _reviewing = false;
  String _filter = 'pending';
  List<Map<String, dynamic>>? _items;
  Object? _error;

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('daily_entries').select('*').order('date', ascending: false).limit(80);
    final rows = List<Map<String, dynamic>>.from(data);
    return rows.where((row) => '${row['review_status'] ?? 'pending'}'.toLowerCase() == _filter).toList();
  }

  Future<void> _refresh() async {
    try {
      final rows = await _load();
      if (mounted) {
        setState(() {
          _items = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyDbError(e));
    }
  }

  Future<void> _mark(Map<String, dynamic> row, String status) async {
    setState(() => _reviewing = true);
    try {
      final result = await supabase.rpc('ceo_review_daily_entry', params: {
        'entry_uuid': row['id'],
        'new_status': status,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Entry $status: ${result?['message'] ?? 'done'}')));
        setState(() => _items = (_items ?? []).where((item) => item['id'] != row['id']).toList());
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Entry review failed: ${friendlyDbError(e)}'), backgroundColor: const Color(0xFFB91C1C)));
      }
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _items == null && _error == null ? _load() : Future.value(_items ?? const <Map<String, dynamic>>[]),
      builder: (context, snap) {
        if (snap.hasData && _items == null) {
          _items = snap.data;
        }
        final rows = _items ?? snap.data ?? const <Map<String, dynamic>>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Daily entries review', subtitle: 'Accountant income and expense entries are visible here. Rejecting marks the entry for office correction; it does not change town prices or inventory.'),
          FilterChips(
            value: _filter,
            options: const ['pending', 'approved', 'rejected'],
            onChanged: (next) => setState(() {
              _filter = next;
              _items = null;
              _error = null;
            }),
          ),
          if (_error != null) ErrorBlock(error: 'Schema/API issue: $_error'),
          if (!snap.hasData && _error == null) const SkeletonList(),
          for (var i = 0; i < rows.length; i++)
            AnimatedEntry(
              index: i,
              child: InfoCard(
              icon: badgeForStatus('${rows[i]['review_status'] ?? 'pending'}'),
              status: '${rows[i]['review_status'] ?? 'pending'}',
              title: '${rowVal(rows[i], 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(rows[i], 'Amount')))}',
              subtitle: '${rowVal(rows[i], 'Town_Name') ?? 'No town'} - ${rowVal(rows[i], 'Category') ?? 'General'}',
              meta: '${formatDate(rowVal(rows[i], 'Date'))} - ${rows[i]['review_status'] ?? 'pending'}',
              body: '${rowVal(rows[i], 'Description') ?? ''}',
              actions: [
                if (_filter == 'pending') ...[
                  OutlinedButton.icon(onPressed: _reviewing ? null : () => _mark(rows[i], 'rejected'), icon: const Icon(Icons.report), label: const Text('Reject')),
                  FilledButton.icon(onPressed: _reviewing ? null : () => _mark(rows[i], 'approved'), icon: const Icon(Icons.verified), label: const Text('Approve')),
                ],
              ],
            ),
            ),
          if (snap.hasData && rows.isEmpty && _error == null) EmptyBlock(text: 'No $_filter daily entries.'),
        ],
          ),
        );
      },
    );
  }
}

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('notifications').select('*').eq('dismissed', 'No').order('created_date', ascending: false).limit(80);
    return List<Map<String, dynamic>>.from(data);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Notifications', subtitle: 'Installment, file, and business alerts for CEO attention.'),
          if (!snap.hasData) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())),
          for (final n in snap.data ?? [])
            InfoCard(
              title: '${rowVal(n, 'Type') ?? 'Alert'}',
              subtitle: '${rowVal(n, 'Town_Name') ?? ''} ${rowVal(n, 'Plot_Shop_Number') ?? ''}',
              meta: formatDate(rowVal(n, 'Created_Date')),
              body: '${rowVal(n, 'Message') ?? ''}',
            ),
          if (snap.hasData && snap.data!.isEmpty) const EmptyBlock(text: 'No active notifications.'),
        ],
      ),
    );
  }
}

class TownsPage extends StatelessWidget {
  const TownsPage({super.key});

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('towns').select('*').order('town_name');
    return List<Map<String, dynamic>>.from(data);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Balance enquiries', subtitle: 'Read-only town performance. Price and inventory editing is not available on mobile.'),
          if (!snap.hasData) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())),
          for (final t in snap.data ?? [])
            InfoCard(
              title: '${rowVal(t, 'Town_Name') ?? 'Town'}',
              subtitle: 'Profit/Loss: ${money.format(asNum(rowVal(t, 'Profit_Loss')))}',
              meta: 'Income ${money.format(asNum(rowVal(t, 'Total_Income_PKR')))} - Expenses ${money.format(asNum(rowVal(t, 'Total_Expenses_PKR')))}',
              body: 'Plots ${rowVal(t, 'Total_Plots') ?? 0} - Shops ${rowVal(t, 'Total_Shops') ?? 0} - Status ${rowVal(t, 'Status') ?? 'Active'}',
            ),
          if (snap.hasData && snap.data!.isEmpty) const EmptyBlock(text: 'No towns found.'),
        ],
      ),
    );
  }
}

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final items = [
      MoreItem('Live activity', 'Sales, expenses, and synced business movement.', const VectorBadge(kind: BadgeKind.activity), () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DetailScaffold(title: 'Live activity', child: ActivityPage())));
      }),
      MoreItem('Notifications', 'Installments, file, and business alerts.', const VectorBadge(kind: BadgeKind.alert), () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DetailScaffold(title: 'Notifications', child: NotificationsPage())));
      }),
      MoreItem('Balance enquiries', 'Read-only town performance and balances.', const VectorBadge(kind: BadgeKind.town), () {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DetailScaffold(title: 'Balance enquiries', child: TownsPage())));
      }),
      MoreItem('Logout', 'Sign out from this CEO device.', const VectorBadge(kind: BadgeKind.reject), () {
        supabase.auth.signOut();
      }),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const HeaderBlock(title: 'More', subtitle: 'Secondary CEO tools grouped here to keep the phone navigation compact.'),
        for (var i = 0; i < items.length; i++)
          AnimatedEntry(
            index: i,
            child: Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                leading: items[i].icon,
                title: Text(items[i].title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text(items[i].subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.chevron_right),
                onTap: items[i].onTap,
              ),
            ),
          ),
      ],
    );
  }
}

class MoreItem {
  const MoreItem(this.title, this.subtitle, this.icon, this.onTap);
  final String title;
  final String subtitle;
  final Widget icon;
  final VoidCallback onTap;
}

class DetailScaffold extends StatelessWidget {
  const DetailScaffold({super.key, required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(child: child),
    );
  }
}

class HeaderBlock extends StatelessWidget {
  const HeaderBlock({super.key, required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final titleSize = width < 340 ? 20.0 : 22.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: titleSize, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Text(subtitle, style: const TextStyle(color: Color(0xFF64748B), height: 1.35, fontSize: 13)),
      ]),
    );
  }
}

class StatusStrip extends StatelessWidget {
  const StatusStrip({super.key, required this.items});
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items.map((item) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: const Color(0xFFBFDBFE)),
          ),
          child: Text(item, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFF1E3A8A))),
        )).toList(),
      ),
    );
  }
}

class ErrorBlock extends StatelessWidget {
  const ErrorBlock({super.key, required this.error});
  final String error;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFFEF2F2),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(error, style: const TextStyle(color: Color(0xFF991B1B), fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class Metric {
  const Metric(this.label, this.value, this.icon, this.color);
  final String label;
  final String value;
  final IconData icon;
  final Color color;
}

class MetricGrid extends StatelessWidget {
  const MetricGrid({super.key, required this.metrics});
  final List<Metric> metrics;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 360;
        return GridView.count(
          crossAxisCount: narrow ? 1 : 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: narrow ? 3.05 : 1.38,
          children: [
            for (var i = 0; i < metrics.length; i++)
              AnimatedEntry(
                index: i,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(metrics[i].icon, color: metrics[i].color, size: narrow ? 18 : 20),
                      const Spacer(),
                      Text(metrics[i].value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: narrow ? 17 : 19, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Text(metrics[i].label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w700, fontSize: 12)),
                    ]),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.title, required this.subtitle, required this.meta, required this.body, this.actions = const [], this.icon, this.status});
  final String title;
  final String subtitle;
  final String meta;
  final String body;
  final List<Widget> actions;
  final Widget? icon;
  final String? status;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (icon != null) ...[
              icon!,
              const SizedBox(width: 10),
            ],
            Expanded(child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900))),
            if (status != null) StatusPill(status: status!),
          ]),
          const SizedBox(height: 5),
          Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(meta, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
          if (body.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(body, maxLines: 5, overflow: TextOverflow.ellipsis),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final actionWidth = constraints.maxWidth < 340 ? constraints.maxWidth : 168.0;
                return Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: actions
                      .map((action) => ConstrainedBox(
                            constraints: BoxConstraints(maxWidth: actionWidth),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: action,
                            ),
                          ))
                      .toList(),
                );
              },
            ),
          ],
        ]),
      ),
    );
  }
}

class EmptyBlock extends StatelessWidget {
  const EmptyBlock({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Center(child: Text(text, style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w700))),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final clean = status.toLowerCase();
    final color = clean == 'approved'
        ? const Color(0xFF0F766E)
        : clean == 'rejected'
            ? const Color(0xFFB91C1C)
            : const Color(0xFFB45309);
    return Container(
      margin: const EdgeInsets.only(left: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.22)),
      ),
      child: Text(clean, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900)),
    );
  }
}

class FilterChips extends StatelessWidget {
  const FilterChips({super.key, required this.value, required this.options, required this.onChanged});
  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: options.map((option) {
          final selected = option == value;
          return ChoiceChip(
            selected: selected,
            label: Text(option),
            avatar: badgeForStatus(option),
            onSelected: (_) => onChanged(option),
            labelStyle: TextStyle(fontWeight: FontWeight.w900, color: selected ? Colors.white : const Color(0xFF0F172A)),
            selectedColor: const Color(0xFF0F766E),
            backgroundColor: Colors.white,
            side: BorderSide(color: selected ? const Color(0xFF0F766E) : const Color(0xFFE2E8F0)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          );
        }).toList(),
      ),
    );
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(3, (i) => AnimatedEntry(
        index: i,
        child: Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              skeletonLine(width: 180, height: 16),
              const SizedBox(height: 10),
              skeletonLine(width: double.infinity, height: 12),
              const SizedBox(height: 8),
              skeletonLine(width: 120, height: 12),
            ]),
          ),
        ),
      )),
    );
  }
}

Widget skeletonLine({required double width, required double height}) {
  return Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: const Color(0xFFE2E8F0),
      borderRadius: BorderRadius.circular(999),
    ),
  );
}

class AnimatedEntry extends StatelessWidget {
  const AnimatedEntry({super.key, required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final delayIndex = index.clamp(0, 8).toInt();
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 240 + (delayIndex * 26)),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(offset: Offset(0, 10 * (1 - value)), child: child),
      ),
      child: child,
    );
  }
}

enum BadgeKind { brand, money, alert, approve, reject, pending, town, activity, entry }

class VectorBadge extends StatelessWidget {
  const VectorBadge({super.key, required this.kind, this.size = 32});
  final BadgeKind kind;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = switch (kind) {
      BadgeKind.approve => const Color(0xFF0F766E),
      BadgeKind.reject => const Color(0xFFB91C1C),
      BadgeKind.pending => const Color(0xFFB45309),
      BadgeKind.alert => const Color(0xFF7C3AED),
      BadgeKind.money => const Color(0xFF0F766E),
      BadgeKind.town => const Color(0xFF2563EB),
      BadgeKind.activity => const Color(0xFF475569),
      BadgeKind.entry => const Color(0xFFBE123C),
      BadgeKind.brand => const Color(0xFF0F172A),
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(size * 0.34),
        border: Border.all(color: color.withOpacity(0.24)),
      ),
      child: CustomPaint(painter: BadgePainter(kind: kind, color: color)),
    );
  }
}

class BadgePainter extends CustomPainter {
  const BadgePainter({required this.kind, required this.color});
  final BadgeKind kind;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.075
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width * 0.25;

    if (kind == BadgeKind.approve) {
      canvas.drawCircle(c, r, p);
      canvas.drawLine(Offset(size.width * 0.34, size.height * 0.52), Offset(size.width * 0.46, size.height * 0.64), p);
      canvas.drawLine(Offset(size.width * 0.46, size.height * 0.64), Offset(size.width * 0.68, size.height * 0.38), p);
      return;
    }
    if (kind == BadgeKind.reject) {
      canvas.drawCircle(c, r, p);
      canvas.drawLine(Offset(size.width * 0.38, size.height * 0.38), Offset(size.width * 0.62, size.height * 0.62), p);
      canvas.drawLine(Offset(size.width * 0.62, size.height * 0.38), Offset(size.width * 0.38, size.height * 0.62), p);
      return;
    }
    if (kind == BadgeKind.pending) {
      canvas.drawCircle(c, r, p);
      canvas.drawLine(c, Offset(size.width * 0.50, size.height * 0.34), p);
      canvas.drawLine(c, Offset(size.width * 0.64, size.height * 0.56), p);
      return;
    }

    final rect = Rect.fromCenter(center: c, width: size.width * 0.48, height: size.height * 0.38);
    if (kind == BadgeKind.money) {
      canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(size.width * 0.08)), p);
      canvas.drawCircle(c, size.width * 0.08, p);
      return;
    }
    if (kind == BadgeKind.town || kind == BadgeKind.brand) {
      canvas.drawRect(Rect.fromLTWH(size.width * 0.32, size.height * 0.28, size.width * 0.36, size.height * 0.46), p);
      canvas.drawLine(Offset(size.width * 0.42, size.height * 0.74), Offset(size.width * 0.42, size.height * 0.60), p);
      canvas.drawLine(Offset(size.width * 0.58, size.height * 0.74), Offset(size.width * 0.58, size.height * 0.60), p);
      return;
    }
    if (kind == BadgeKind.alert) {
      final path = Path()
        ..moveTo(size.width * 0.50, size.height * 0.24)
        ..lineTo(size.width * 0.72, size.height * 0.68)
        ..lineTo(size.width * 0.28, size.height * 0.68)
        ..close();
      canvas.drawPath(path, p);
      canvas.drawLine(Offset(size.width * 0.50, size.height * 0.42), Offset(size.width * 0.50, size.height * 0.54), p);
      return;
    }

    canvas.drawCircle(c, r, p);
    canvas.drawLine(Offset(size.width * 0.36, size.height * 0.50), Offset(size.width * 0.64, size.height * 0.50), p);
    canvas.drawLine(Offset(size.width * 0.50, size.height * 0.36), Offset(size.width * 0.50, size.height * 0.64), p);
  }

  @override
  bool shouldRepaint(covariant BadgePainter oldDelegate) => oldDelegate.kind != kind || oldDelegate.color != color;
}

Widget badgeForStatus(String status) {
  final clean = status.toLowerCase();
  if (clean == 'approved') return const VectorBadge(kind: BadgeKind.approve, size: 24);
  if (clean == 'rejected') return const VectorBadge(kind: BadgeKind.reject, size: 24);
  return const VectorBadge(kind: BadgeKind.pending, size: 24);
}

class CeoNotificationService {
  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static final Set<String> _shownMessageKeys = <String>{};

  static Future<void> init() async {
    if (_initialized) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        final route = response.payload;
        if (route != null) routeFromPushData({'route': route});
      },
    );
    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'ceo_live_alerts',
        'CEO Live Alerts',
        description: 'Appeals, notifications, and daily-entry review alerts.',
        importance: Importance.high,
      ),
    );
    await androidPlugin?.requestNotificationsPermission();
    _initialized = true;
  }

  static Future<bool> showFromRemoteMessage(RemoteMessage message) async {
    if (!_isFreshMessage(message)) return false;

    final messageKey = _messageDedupeKey(message);
    if (!_shownMessageKeys.add(messageKey)) return false;
    if (_shownMessageKeys.length > 200) {
      _shownMessageKeys.clear();
      _shownMessageKeys.add(messageKey);
    }
    final title = message.notification?.title ?? message.data['title'] ?? titleForTable(message.data['table']);
    final body = message.notification?.body ?? message.data['body'] ?? 'Open CEO app for details';
    final route = message.data['route'] ?? routeForTable(message.data['table']);
    await show(title, body, payload: route);
    return true;
  }

  static bool _isFreshMessage(RemoteMessage message) {
    final now = DateTime.now();
    final sentTime = message.sentTime;
    if (sentTime != null) {
      if (sentTime.isBefore(appStartedAt.subtract(const Duration(seconds: 30)))) return false;
      if (now.difference(sentTime) > pushFreshnessWindow) return false;
    }

    final eventTime = _parsePushTime(message.data['event_time'] ?? message.data['created_at'] ?? message.data['updated_at']);
    if (eventTime != null && now.difference(eventTime) > pushFreshnessWindow) return false;
    return true;
  }

  static String _messageDedupeKey(RemoteMessage message) {
    final data = message.data;
    final stableKey = data['dedupe_key'];
    if (stableKey != null && '$stableKey'.trim().isNotEmpty) return '$stableKey';
    final table = data['table'] ?? '';
    final event = data['event'] ?? '';
    final id = data['id'] ?? '';
    final route = data['route'] ?? '';
    if ('$table$event$id$route'.trim().isNotEmpty) {
      return '$table:$event:$id:$route';
    }
    return message.messageId ?? DateTime.now().millisecondsSinceEpoch.toString();
  }

  static DateTime? _parsePushTime(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse('$value')?.toLocal();
  }

  static Future<void> show(String title, String body, {String? payload}) async {
    const android = AndroidNotificationDetails(
      'ceo_live_alerts',
      'CEO Live Alerts',
      channelDescription: 'Appeals, notifications, and daily-entry review alerts.',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
    );
    const details = NotificationDetails(android: android);
    final id = DateTime.now().millisecondsSinceEpoch.remainder(1000000);
    await _plugin.show(id, title, body, details, payload: payload);
  }
}

num asNum(dynamic value) {
  if (value is num) return value;
  return num.tryParse('${value ?? 0}') ?? 0;
}

String pretty(dynamic value) => '${value ?? ''}'.replaceAll('_', ' ').trim();

String titleForTable(dynamic table) {
  switch ('$table') {
    case 'appeals':
      return 'CEO appeal update';
    case 'notifications':
      return 'Business notification';
    case 'daily_entries':
      return 'Daily entry update';
    default:
      return 'CEO alert';
  }
}

String routeForTable(dynamic table) {
  switch ('$table') {
    case 'appeals':
      return 'appeals';
    case 'notifications':
      return 'notifications';
    case 'daily_entries':
      return 'entries';
    case 'all_sales':
    case 'properties':
    case 'expenses':
      return 'activity';
    case 'towns':
      return 'towns';
    default:
      return 'home';
  }
}

void routeFromPushData(Map<String, dynamic> data) {
  final route = data['route'] ?? routeForTable(data['table']);
  final nextTab = switch ('$route') {
    'appeals' => 1,
    'entries' => 2,
    'activity' || 'notifications' || 'towns' => 3,
    _ => 0,
  };
  selectedTabNotifier.value = nextTab;
}

dynamic rowVal(Map<String, dynamic> row, String key) {
  final lower = key.replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}').toLowerCase();
  return row[key] ?? row[lower];
}

String formatDate(dynamic value) {
  if (value == null) return '';
  final parsed = DateTime.tryParse('$value');
  return parsed == null ? '$value' : shortDate.format(parsed);
}

String friendlyDbError(Object error) {
  final raw = '$error';
  if (raw.contains('PGRST204') || raw.toLowerCase().contains('schema cache')) {
    return 'Supabase schema cache needs repair. Run src/sql/ceo-review-schema-repair.sql once.';
  }
  if (raw.toLowerCase().contains('review_status')) {
    return 'daily_entries review columns are missing. Run src/sql/ceo-review-schema-repair.sql once.';
  }
  if (raw.toLowerCase().contains('ceo_review_appeal')) {
    return 'CEO review RPC is missing. Run src/sql/ceo-review-schema-repair.sql once.';
  }
  return raw.replaceAll(RegExp(r'PostgrestException\(message: ?'), '').replaceAll(RegExp(r'\)$'), '');
}

String safeSummary(dynamic value) {
  if (value == null) return '';
  if (value is Map) {
    final safeKeys = ['townName', 'Town_Name', 'town_name', 'type', 'Type', 'category', 'Category', 'date', 'amount'];
    final parts = <String>[];
    for (final key in safeKeys) {
      if (value[key] != null && '${value[key]}'.trim().isNotEmpty) {
        parts.add('$key: ${value[key]}');
      }
    }
    return parts.take(5).join(' - ');
  }
  return '$value';
}
