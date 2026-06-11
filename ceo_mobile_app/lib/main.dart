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

final appNavigatorKey = GlobalKey<NavigatorState>();
final selectedTabNotifier = ValueNotifier<int>(0);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await CeoNotificationService.init();
  await CeoNotificationService.showFromRemoteMessage(message);
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
          padding: const EdgeInsets.all(22),
          children: [
            const SizedBox(height: 42),
            Container(
              height: 78,
              width: 78,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Text('AS', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 22),
            const Text('AL SIRAJ DEVELOPERS', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            const Text('CEO command center for approvals, alerts, balances, and town performance.'),
            const SizedBox(height: 28),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'CEO email', prefixIcon: Icon(Icons.mail_outline))),
            const SizedBox(height: 14),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline))),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 22),
            FilledButton.icon(
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
  final pages = const [OverviewPage(), AppealsPage(), DailyEntriesPage(), ActivityPage(), NotificationsPage(), TownsPage()];
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
      await CeoNotificationService.showFromRemoteMessage(message);
      routeFromPushData(message.data);
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
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Appeal update',
              '${pretty(row['appeal_type'])} needs CEO review',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'all_sales',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Property sale update',
              '${rowVal(row, 'Town_Name') ?? 'Town'} ${rowVal(row, 'Plot_Shop_Number') ?? ''} sold',
              payload: 'activity',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'properties',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Property update',
              '${rowVal(row, 'Town_Name') ?? 'Town'} ${rowVal(row, 'Property_Number') ?? ''}',
              payload: 'activity',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'installments',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Installment update',
              '${rowVal(row, 'Customer_Name') ?? 'Customer'} - ${rowVal(row, 'Town_Name') ?? 'Town'}',
              payload: 'notifications',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'expenses',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Expense update',
              '${rowVal(row, 'Town_Name') ?? 'Town'} - ${money.format(asNum(rowVal(row, 'Amount_PKR')))}',
              payload: 'activity',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'notifications',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              '${rowVal(row, 'Type') ?? 'New notification'}',
              '${rowVal(row, 'Message') ?? 'Open CEO app for details'}',
            );
            if (mounted) setState(() {});
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'daily_entries',
          callback: (payload) {
            final row = payload.newRecord;
            CeoNotificationService.show(
              'Daily entry update',
              '${rowVal(row, 'Type') ?? 'Entry'} ${money.format(asNum(rowVal(row, 'Amount')))} for ${rowVal(row, 'Town_Name') ?? 'town'}',
            );
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
        title: const Text('AL SIRAJ DEVELOPERS'),
        actions: [
          IconButton(
            tooltip: 'Logout',
            onPressed: () => supabase.auth.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: _tab == 0
          ? OverviewPage(pushStatus: _pushStatus, realtimeStatus: _realtimeStatus)
          : pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.space_dashboard_outlined), selectedIcon: Icon(Icons.space_dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.rule_outlined), selectedIcon: Icon(Icons.rule), label: 'Appeals'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Entries'),
          NavigationDestination(icon: Icon(Icons.timeline_outlined), selectedIcon: Icon(Icons.timeline), label: 'Activity'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.location_city_outlined), selectedIcon: Icon(Icons.location_city), label: 'Towns'),
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
  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('appeals').select('*, requested_by_user_id(full_name,email,agent_town)').eq('status', 'pending').order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(data);
  }

  Future<void> _review(String id, String status) async {
    final userId = supabase.auth.currentUser?.id;
    await supabase.from('appeals').update({
      'status': status,
      'reviewed_at': DateTime.now().toIso8601String(),
      'reviewed_by_user_id': userId,
    }).eq('id', id);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Appeals', subtitle: 'Approve or reject requests from agents and accountants.'),
          if (!snap.hasData) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())),
          for (final a in snap.data ?? [])
            InfoCard(
              title: pretty(a['appeal_type']),
              subtitle: '${a['entity_type'] ?? ''} ${a['entity_id'] ?? ''}',
              meta: '${a['requested_by_user_id']?['full_name'] ?? 'User'} - ${formatDate(a['created_at'])}',
              body: '${a['reason'] ?? a['requested_data'] ?? ''}',
              actions: [
                OutlinedButton.icon(onPressed: () => _review(a['id'], 'rejected'), icon: const Icon(Icons.close), label: const Text('Reject')),
                FilledButton.icon(onPressed: () => _review(a['id'], 'approved'), icon: const Icon(Icons.check), label: const Text('Approve')),
              ],
            ),
          if (snap.hasData && snap.data!.isEmpty) const EmptyBlock(text: 'No pending appeals.'),
        ],
      ),
    );
  }
}

class DailyEntriesPage extends StatefulWidget {
  const DailyEntriesPage({super.key});

  @override
  State<DailyEntriesPage> createState() => _DailyEntriesPageState();
}

class _DailyEntriesPageState extends State<DailyEntriesPage> {
  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('daily_entries').select('*').order('date', ascending: false).limit(80);
    return List<Map<String, dynamic>>.from(data);
  }

  Future<void> _mark(Map<String, dynamic> row, String status) async {
    await supabase.from('daily_entries').update({
      'review_status': status,
      'reviewed_by': supabase.auth.currentUser?.id,
      'reviewed_at': DateTime.now().toIso8601String(),
    }).eq('id', row['id']);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const HeaderBlock(title: 'Daily entries review', subtitle: 'Accountant income and expense entries are visible here. Rejecting marks the entry for office correction; it does not change town prices or inventory.'),
          if (!snap.hasData) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())),
          for (final e in snap.data ?? [])
            InfoCard(
              title: '${rowVal(e, 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(e, 'Amount')))}',
              subtitle: '${rowVal(e, 'Town_Name') ?? 'No town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: '${formatDate(rowVal(e, 'Date'))} - ${e['review_status'] ?? 'pending'}',
              body: '${rowVal(e, 'Description') ?? ''}',
              actions: [
                OutlinedButton.icon(onPressed: () => _mark(e, 'rejected'), icon: const Icon(Icons.report), label: const Text('Reject')),
                FilledButton.icon(onPressed: () => _mark(e, 'approved'), icon: const Icon(Icons.verified), label: const Text('Approve')),
              ],
            ),
          if (snap.hasData && snap.data!.isEmpty) const EmptyBlock(text: 'No daily entries found.'),
        ],
      ),
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

class HeaderBlock extends StatelessWidget {
  const HeaderBlock({super.key, required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Text(subtitle, style: const TextStyle(color: Color(0xFF64748B), height: 1.35)),
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
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.06,
      children: metrics.map((m) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(m.icon, color: m.color),
            const Spacer(),
            Text(m.value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(m.label, style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
          ]),
        ),
      )).toList(),
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.title, required this.subtitle, required this.meta, required this.body, this.actions = const []});
  final String title;
  final String subtitle;
  final String meta;
  final String body;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
          const SizedBox(height: 5),
          Text(subtitle, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(meta, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
          if (body.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(body, maxLines: 5, overflow: TextOverflow.ellipsis),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: actions),
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

class CeoNotificationService {
  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

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

  static Future<void> showFromRemoteMessage(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title'] ?? titleForTable(message.data['table']);
    final body = message.notification?.body ?? message.data['body'] ?? 'Open CEO app for details';
    final route = message.data['route'] ?? routeForTable(message.data['table']);
    await show(title, body, payload: route);
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
    'activity' => 3,
    'notifications' => 4,
    'towns' => 5,
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
