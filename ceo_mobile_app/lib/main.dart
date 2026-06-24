import 'dart:async';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:percent_indicator/linear_percent_indicator.dart';
import 'package:shimmer/shimmer.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:responsive_framework/responsive_framework.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

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
  await Supabase.initialize(url: supabaseUrl, publishableKey: _fullAnonKey);
  await CeoNotificationService.init();
  runApp(const CeoMobileApp());
}

final supabase = Supabase.instance.client;
final money = NumberFormat.currency(
  locale: 'en_PK',
  symbol: 'PKR ',
  decimalDigits: 0,
);
final shortDate = DateFormat('dd MMM yyyy');

const kBg = Color(0xFFF5F7FA);
const kSurface = Color(0xFFFFFFFF);
const kPrimary = Color(0xFF6C63FF);
const kSecondary = Color(0xFF00C9A7);
const kText = Color(0xFF1A1D2E);
const kMuted = Color(0xFF8A94A6);
const kBorder = Color(0x12000000);

class TownPulse {
  const TownPulse({
    required this.name,
    this.accountantName = '',
    this.totalReceived = 0,
    this.totalExpenses = 0,
    this.cashBalance = 0,
    this.pendingAppeals = 0,
    this.pendingCollection = 0,
    this.todayIncome = 0,
    this.todayExpense = 0,
    this.salesCount = 0,
  });

  final String name;
  final String accountantName;
  final num totalReceived;
  final num totalExpenses;
  final num cashBalance;
  final num pendingAppeals;
  final num pendingCollection;
  final num todayIncome;
  final num todayExpense;
  final int salesCount;
}

class LedgerReceipt {
  const LedgerReceipt({
    required this.townName,
    required this.date,
    required this.incomeRows,
    required this.expenseRows,
  });

  final String townName;
  final DateTime date;
  final List<Map<String, dynamic>> incomeRows;
  final List<Map<String, dynamic>> expenseRows;

  num get income =>
      incomeRows.fold<num>(0, (sum, row) => sum + asNum(rowVal(row, 'Amount')));
  num get expense => expenseRows.fold<num>(
    0,
    (sum, row) => sum + asNum(rowVal(row, 'Amount')),
  );
  num get net => income - expense;
  int get count => incomeRows.length + expenseRows.length;
}

class CeoMobileApp extends StatelessWidget {
  const CeoMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = GoogleFonts.interTextTheme();
    return MaterialApp(
      navigatorKey: appNavigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'AL SIRAJ DEVELOPERS',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        textTheme: textTheme.apply(bodyColor: kText, displayColor: kText),
        colorScheme: const ColorScheme.light(
          primary: kPrimary,
          secondary: kSecondary,
          surface: kSurface,
          onSurface: kText,
          outline: kBorder,
        ),
        scaffoldBackgroundColor: kBg,
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: false,
          foregroundColor: kText,
          titleTextStyle: GoogleFonts.inter(
            color: kText,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: kSurface,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: kSurface,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: kBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: kBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: kPrimary, width: 1.4),
          ),
          labelStyle: const TextStyle(
            color: kMuted,
            fontWeight: FontWeight.w600,
          ),
          prefixIconColor: kMuted,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kPrimary,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: kText,
            side: const BorderSide(color: kBorder),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ),
      home: const AuthGate(),
      scrollBehavior: const SmoothAppScrollBehavior(),
      builder: (context, child) {
        final media = MediaQuery.of(context);
        final maxScale = media.size.width < 360
            ? 1.0
            : media.size.width < 420
            ? 1.06
            : 1.14;
        final scale = media.textScaler.scale(1).clamp(0.9, maxScale).toDouble();
        return MediaQuery(
          data: media.copyWith(textScaler: TextScaler.linear(scale)),
          child: ResponsiveBreakpoints.builder(
            child: child ?? const SizedBox.shrink(),
            breakpoints: const [
              Breakpoint(start: 0, end: 599, name: MOBILE),
              Breakpoint(start: 600, end: 899, name: TABLET),
              Breakpoint(start: 900, end: double.infinity, name: DESKTOP),
            ],
          ),
        );
      },
    );
  }
}

class SmoothAppScrollBehavior extends MaterialScrollBehavior {
  const SmoothAppScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    return const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());
  }

  @override
  Set<PointerDeviceKind> get dragDevices => {
    PointerDeviceKind.touch,
    PointerDeviceKind.mouse,
    PointerDeviceKind.trackpad,
    PointerDeviceKind.stylus,
  };
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
      final profile = await supabase
          .from('users')
          .select('role,is_active')
          .eq('id', id)
          .single();
      if (profile['role'] != 'ceo' || profile['is_active'] != true) {
        await supabase.auth.signOut();
        throw const AuthException('Only active CEO accounts can use this app.');
      }
    } catch (e) {
      setState(
        () => _error = e
            .toString()
            .replaceFirst('AuthException(message: ', '')
            .replaceAll(')', ''),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const PremiumBackground(),
          SafeArea(
            child: CustomScrollView(
              slivers: [
                const SliverToBoxAdapter(child: SizedBox(height: 18)),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.list(
                    children: [
                      Hero(
                            tag: 'ceo-brand-hero',
                            child: const GradientIconBox(
                              icon: Icons.apartment_rounded,
                              size: 78,
                            ),
                          )
                          .animate()
                          .fadeIn(duration: 520.ms)
                          .scale(
                            begin: const Offset(.86, .86),
                            curve: Curves.easeOutBack,
                          ),
                      const SizedBox(height: 22),
                      Text(
                            'AL SIRAJ\nDEVELOPERS',
                            style: GoogleFonts.inter(
                              fontSize: 32,
                              height: 1.02,
                              fontWeight: FontWeight.w900,
                              color: kText,
                            ),
                          )
                          .animate()
                          .fadeIn(delay: 90.ms)
                          .slideY(begin: .16, curve: Curves.easeOutCubic),
                      const SizedBox(height: 10),
                      const Text(
                            'Premium CEO command center for approvals, alerts, balances, and town performance.',
                            style: TextStyle(
                              color: kMuted,
                              height: 1.45,
                              fontWeight: FontWeight.w500,
                            ),
                          )
                          .animate()
                          .fadeIn(delay: 150.ms)
                          .slideY(begin: .12, curve: Curves.easeOutCubic),
                      const SizedBox(height: 24),
                      GlassCard(
                            padding: const EdgeInsets.all(18),
                            child: Column(
                              children: [
                                TextField(
                                  controller: _email,
                                  keyboardType: TextInputType.emailAddress,
                                  decoration: const InputDecoration(
                                    labelText: 'CEO email',
                                    prefixIcon: Icon(
                                      Icons.mail_outline_rounded,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                TextField(
                                  controller: _password,
                                  obscureText: true,
                                  decoration: const InputDecoration(
                                    labelText: 'Password',
                                    prefixIcon: Icon(
                                      Icons.lock_outline_rounded,
                                    ),
                                  ),
                                ),
                                if (_error != null) ...[
                                  const SizedBox(height: 14),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFFEFF0),
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(
                                        color: const Color(0xFFFFCDD2),
                                      ),
                                    ),
                                    child: Text(
                                      _error!,
                                      style: const TextStyle(
                                        color: Color(0xFFB91C1C),
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 18),
                                PressableScale(
                                  onTap: _busy ? null : _login,
                                  child: FilledButton.icon(
                                    onPressed: _busy ? null : _login,
                                    icon: _busy
                                        ? const SizedBox.square(
                                            dimension: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : const Icon(
                                            Icons.arrow_forward_rounded,
                                          ),
                                    label: const Text('Enter CEO App'),
                                  ),
                                ),
                              ],
                            ),
                          )
                          .animate()
                          .fadeIn(delay: 220.ms)
                          .slideY(begin: .18, curve: Curves.easeOutCubic),
                      const SizedBox(height: 18),
                      const SecureNoticeCard(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SecureNoticeCard extends StatelessWidget {
  const SecureNoticeCard({super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: const [
              GradientIconBox(
                icon: Icons.verified_user_rounded,
                size: 46,
                colors: [kSecondary, Color(0xFF31E6C5)],
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Read-only for towns, prices, plots and shops. Approval actions are limited to appeals and daily-entry reviews.',
                  style: TextStyle(
                    color: kMuted,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        )
        .animate()
        .fadeIn(delay: 300.ms)
        .slideY(begin: .12, curve: Curves.easeOutCubic);
  }
}

class PremiumBackground extends StatelessWidget {
  const PremiumBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFF9FAFF), kBg],
        ),
      ),
      child: SizedBox.expand(),
    );
  }
}

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.heroTag,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Object? heroTag;

  @override
  Widget build(BuildContext context) {
    final card = PressableScale(
      onTap: onTap,
      child: RepaintBoundary(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          padding: padding,
          decoration: BoxDecoration(
            color: kSurface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: kBorder),
            boxShadow: [
              BoxShadow(
                color: kPrimary.withValues(alpha: .055),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
    return heroTag == null
        ? card
        : Hero(
            tag: heroTag!,
            child: Material(color: Colors.transparent, child: card),
          );
  }
}

class PressableScale extends StatefulWidget {
  const PressableScale({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.onTap == null
          ? null
          : (_) => setState(() => _down = true),
      onTapCancel: widget.onTap == null
          ? null
          : () => setState(() => _down = false),
      onTapUp: widget.onTap == null
          ? null
          : (_) {
              setState(() => _down = false);
              widget.onTap?.call();
            },
      child: AnimatedScale(
        scale: _down ? .97 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}

class GradientIconBox extends StatelessWidget {
  const GradientIconBox({
    super.key,
    required this.icon,
    this.size = 50,
    this.colors = const [kPrimary, Color(0xFF8A84FF)],
  });
  final IconData icon;
  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * .34),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.first.withValues(alpha: .22),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: size * .48),
    );
  }
}

class AnimatedMoneyText extends StatelessWidget {
  const AnimatedMoneyText(this.value, {super.key, this.style});
  final num value;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.toDouble()),
      duration: const Duration(milliseconds: 760),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text(
        money.format(v),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: style,
      ),
    );
  }
}

class PremiumProgress extends StatelessWidget {
  const PremiumProgress({
    super.key,
    required this.percent,
    this.color = kPrimary,
  });
  final double percent;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: percent.clamp(0, 1)),
      duration: const Duration(milliseconds: 800),
      curve: Curves.easeOutCubic,
      builder: (context, value, _) => LinearPercentIndicator(
        lineHeight: 8,
        padding: EdgeInsets.zero,
        percent: value,
        animation: false,
        barRadius: const Radius.circular(99),
        backgroundColor: kBorder,
        linearGradient: LinearGradient(
          colors: [color, color.withValues(alpha: .65)],
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
  double _fabTurns = 0;
  String _pushStatus = 'Checking push setup...';
  String _realtimeStatus = 'Connecting realtime...';
  final pages = const [
    OverviewPage(),
    TownsOverviewPage(),
    AppealsPage(),
    DailyLedgerReceiptPage(),
    MorePage(),
  ];
  final List<dynamic> _channels = [];
  StreamSubscription<RemoteMessage>? _foregroundPushSub;
  StreamSubscription<RemoteMessage>? _openedPushSub;
  Timer? _liveRefreshTimer;

  @override
  void initState() {
    super.initState();
    selectedTabNotifier.addListener(_applySelectedTab);
    _tab = selectedTabNotifier.value;
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
      final profile = await supabase
          .from('users')
          .select('role,is_active')
          .eq('id', userId)
          .single();
      if (profile['role'] != 'ceo' || profile['is_active'] != true) {
        await FirebaseMessaging.instance.unsubscribeFromTopic(ceoPushTopic);
        await supabase.auth.signOut();
        return;
      }

      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
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
      await FirebaseMessaging.instance
          .unsubscribeFromTopic(ceoPushTopic)
          .catchError((_) {});
      if (mounted) {
        setState(
          () => _pushStatus =
              'Push setup failed. Re-login and allow notifications.',
        );
      }
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
    void scheduleLiveRefresh() {
      if (_liveRefreshTimer?.isActive == true) return;
      _liveRefreshTimer = Timer(const Duration(milliseconds: 900), () {
        if (mounted) setState(() {});
      });
    }

    final channel = supabase
        .channel('ceo-mobile-live-alerts')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'appeals',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'all_sales',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'properties',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'installments',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'expenses',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'notifications',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'daily_entries',
          callback: (payload) {
            scheduleLiveRefresh();
          },
        )
        .subscribe((status, error) {
          if (!mounted) return;
          setState(() {
            _realtimeStatus = error == null
                ? 'Realtime: $status'
                : 'Realtime error: $error';
          });
        });
    _channels.add(channel);
  }

  @override
  void dispose() {
    selectedTabNotifier.removeListener(_applySelectedTab);
    _liveRefreshTimer?.cancel();
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
      extendBody: true,
      body: Stack(
        children: [
          const PremiumBackground(),
          SafeArea(
            bottom: false,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) {
                final offset = Tween<Offset>(
                  begin: const Offset(0.03, 0),
                  end: Offset.zero,
                ).animate(animation);
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(position: offset, child: child),
                );
              },
              child: KeyedSubtree(
                key: ValueKey(_tab),
                child: _tab == 0
                    ? OverviewPage(
                        pushStatus: _pushStatus,
                        realtimeStatus: _realtimeStatus,
                      )
                    : pages[_tab],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: PremiumBottomNav(
        currentIndex: _tab,
        onTap: (i) => setState(() => _tab = i),
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 82),
        child: PressableScale(
          onTap: () {
            setState(() {
              _fabTurns += .5;
              _tab = _tab == 2 ? 0 : 2;
            });
          },
          child: AnimatedRotation(
            turns: _fabTurns,
            duration: const Duration(milliseconds: 420),
            curve: Curves.easeOutBack,
            child: Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(_tab == 2 ? 18 : 29),
                gradient: LinearGradient(
                  colors: _tab == 2
                      ? const [Color(0xFF0F766E), kSecondary]
                      : const [Color(0xFF2563EB), Color(0xFF7C3AED)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: (_tab == 2 ? kSecondary : kPrimary).withValues(
                      alpha: .24,
                    ),
                    blurRadius: 26,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Icon(
                _tab == 2
                    ? Icons.dashboard_customize_rounded
                    : Icons.fact_check_rounded,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PremiumBottomNav extends StatelessWidget {
  const PremiumBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });
  final int currentIndex;
  final ValueChanged<int> onTap;

  static const items = [
    (Icons.dashboard_customize_rounded, 'Home'),
    (Icons.location_city_rounded, 'Towns'),
    (Icons.rule_rounded, 'Approvals'),
    (Icons.receipt_long_rounded, 'Ledger'),
    (Icons.apps_rounded, 'More'),
  ];

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final showLabel = width >= 390;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              height: 72,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .92),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withValues(alpha: .8)),
                boxShadow: [
                  BoxShadow(
                    color: kPrimary.withValues(alpha: .14),
                    blurRadius: 30,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Row(
                children: [
                  for (var i = 0; i < items.length; i++)
                    Expanded(
                      flex: currentIndex == i && showLabel ? 14 : 10,
                      child: PressableScale(
                        onTap: () => onTap(i),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 260),
                          curve: Curves.easeOutCubic,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            color: currentIndex == i
                                ? kPrimary.withValues(alpha: .12)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Center(
                            child: TweenAnimationBuilder<double>(
                              tween: Tween(
                                begin: 1,
                                end: currentIndex == i ? 1.16 : 1,
                              ),
                              duration: const Duration(milliseconds: 280),
                              curve: Curves.elasticOut,
                              builder: (context, scale, child) =>
                                  Transform.scale(scale: scale, child: child),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    items[i].$1,
                                    color: currentIndex == i
                                        ? kPrimary
                                        : kMuted,
                                    size: 23,
                                  ),
                                  AnimatedSize(
                                    duration: const Duration(milliseconds: 220),
                                    curve: Curves.easeOutCubic,
                                    child: currentIndex == i && showLabel
                                        ? Padding(
                                            padding: const EdgeInsets.only(
                                              left: 7,
                                            ),
                                            child: ConstrainedBox(
                                              constraints: const BoxConstraints(
                                                maxWidth: 72,
                                              ),
                                              child: FittedBox(
                                                fit: BoxFit.scaleDown,
                                                child: Text(
                                                  items[i].$2,
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    color: kPrimary,
                                                    fontWeight: FontWeight.w900,
                                                    fontSize: 11,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          )
                                        : const SizedBox.shrink(),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
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

PageRouteBuilder<void> premiumRoute(Widget page) {
  return PageRouteBuilder<void>(
    transitionDuration: const Duration(milliseconds: 360),
    reverseTransitionDuration: const Duration(milliseconds: 260),
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, animation, __, child) {
      final offset = Tween<Offset>(
        begin: const Offset(.08, 0),
        end: Offset.zero,
      ).chain(CurveTween(curve: Curves.easeOutCubic)).animate(animation);
      return FadeTransition(
        opacity: animation,
        child: SlideTransition(position: offset, child: child),
      );
    },
  );
}

class PremiumScrollView extends StatelessWidget {
  const PremiumScrollView({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 110),
    this.appBarTitle = 'Overview',
    this.showAppBar = true,
    this.showNotificationAction = true,
  });
  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final String appBarTitle;
  final bool showAppBar;
  final bool showNotificationAction;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      slivers: [
        if (showAppBar)
          SliverAppBar(
            automaticallyImplyLeading: false,
            floating: true,
            snap: true,
            backgroundColor: Colors.transparent,
            elevation: 0,
            toolbarHeight: 58,
            titleSpacing: 20,
            title: Text(
              appBarTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: kText,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            actions: showNotificationAction
                ? [
                    Padding(
                      padding: const EdgeInsets.only(right: 14),
                      child: Stack(
                        alignment: Alignment.topRight,
                        children: [
                          IconButton(
                            onPressed: () => selectedTabNotifier.value = 4,
                            icon: const Icon(
                              Icons.notifications_rounded,
                              color: kText,
                            ),
                          ),
                          Positioned(
                            right: 10,
                            top: 10,
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: kSecondary,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ]
                : null,
          ),
        SliverPadding(
          padding: padding,
          sliver: SliverList(delegate: SliverChildListDelegate.fixed(children)),
        ),
      ],
    );
  }
}

Future<List<TownPulse>> loadTownPulses() async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final results = await Future.wait<dynamic>([
    supabase.from('towns').select('*').order('town_name'),
    supabase
        .from('appeals')
        .select('*, requested_by_user_id(full_name,email,town_name,town_id)')
        .eq('status', 'pending'),
    supabase.from('daily_entries').select('*'),
    supabase.from('all_sales').select('*'),
    supabase
        .from('users')
        .select('full_name,town_name,town_id,role')
        .eq('role', 'accountant'),
  ]);

  final towns = List<Map<String, dynamic>>.from(results[0]);
  final appeals = List<Map<String, dynamic>>.from(results[1]);
  final entries = List<Map<String, dynamic>>.from(results[2]);
  final sales = List<Map<String, dynamic>>.from(results[3]);
  final accountants = List<Map<String, dynamic>>.from(results[4]);

  final names = <String>{
    ...towns.map((t) => '${rowVal(t, 'Town_Name')}'.trim()),
    ...appeals.map(appealTownName),
    ...entries.map((e) => '${rowVal(e, 'Town_Name')}'.trim()),
    ...sales.map((s) => '${rowVal(s, 'Town_Name')}'.trim()),
  }..removeWhere((name) => name.isEmpty || name == 'null');

  return names.map((townName) {
    final townEntries = entries
        .where((e) => '${rowVal(e, 'Town_Name')}'.trim() == townName)
        .toList();
    final todayEntries = townEntries
        .where((e) => '${rowVal(e, 'Date')}'.startsWith(today))
        .toList();
    final townSales = sales
        .where((s) => '${rowVal(s, 'Town_Name')}'.trim() == townName)
        .toList();
    final pendingAppeals = appeals
        .where((a) => appealTownName(a).trim() == townName)
        .length;
    final accountant = accountants.firstWhere(
      (a) =>
          '${rowVal(a, 'Town_Name')}'.trim() == townName ||
          '${a['town_id'] ?? ''}'.trim() == townName,
      orElse: () => const <String, dynamic>{},
    );
    final totalIncome = townEntries
        .where((e) => '${rowVal(e, 'Type')}'.toLowerCase() == 'income')
        .fold<num>(0, (sum, e) => sum + asNum(rowVal(e, 'Amount')));
    final totalExpense = townEntries
        .where((e) => '${rowVal(e, 'Type')}'.toLowerCase() == 'expense')
        .fold<num>(0, (sum, e) => sum + asNum(rowVal(e, 'Amount')));
    final saleReceived = townSales.fold<num>(
      0,
      (sum, s) =>
          sum +
          (asNum(rowVal(s, 'Received_Amount')) == 0
              ? asNum(rowVal(s, 'Advance_Amount_PKR'))
              : asNum(rowVal(s, 'Received_Amount'))),
    );
    final pendingCollection = townSales.fold<num>(
      0,
      (sum, s) => sum + asNum(rowVal(s, 'Remaining_Amount')),
    );
    final todayIncome = todayEntries
        .where((e) => '${rowVal(e, 'Type')}'.toLowerCase() == 'income')
        .fold<num>(0, (sum, e) => sum + asNum(rowVal(e, 'Amount')));
    final todayExpense = todayEntries
        .where((e) => '${rowVal(e, 'Type')}'.toLowerCase() == 'expense')
        .fold<num>(0, (sum, e) => sum + asNum(rowVal(e, 'Amount')));

    final totalReceived = totalIncome + saleReceived;
    final totalExpenses = totalExpense;
    return TownPulse(
      name: townName,
      accountantName: '${accountant['full_name'] ?? ''}'.trim(),
      totalReceived: totalReceived,
      totalExpenses: totalExpenses,
      cashBalance: totalReceived - totalExpenses,
      pendingAppeals: pendingAppeals,
      pendingCollection: pendingCollection,
      todayIncome: todayIncome,
      todayExpense: todayExpense,
      salesCount: townSales.length,
    );
  }).toList()..sort((a, b) => a.name.compareTo(b.name));
}

class OverviewPage extends StatefulWidget {
  const OverviewPage({
    super.key,
    this.pushStatus = '',
    this.realtimeStatus = '',
  });
  final String pushStatus;
  final String realtimeStatus;

  @override
  State<OverviewPage> createState() => _OverviewPageState();
}

class _OverviewPageState extends State<OverviewPage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 220));
    final towns = await loadTownPulses();
    return {
      'towns': towns,
      'appeals': towns.fold<num>(0, (sum, t) => sum + t.pendingAppeals),
      'received': towns.fold<num>(0, (sum, t) => sum + t.totalReceived),
      'expenses': towns.fold<num>(0, (sum, t) => sum + t.totalExpenses),
      'cash': towns.fold<num>(0, (sum, t) => sum + t.cashBalance),
      'pending': towns.fold<num>(0, (sum, t) => sum + t.pendingCollection),
      'sales': towns.fold<int>(0, (sum, t) => sum + t.salesCount),
    };
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          final d = snap.data;
          final towns =
              (d?['towns'] as List<TownPulse>?) ?? const <TownPulse>[];
          final received = asNum(d?['received']);
          final expenses = asNum(d?['expenses']);
          final pending = asNum(d?['pending']);
          final appeals = asNum(d?['appeals']);
          final collectionTotal = received + pending;
          final moneyMovement = received + expenses;
          final collectionProgress = collectionTotal <= 0
              ? null
              : (received / collectionTotal).clamp(0, 1).toDouble();
          final expenseShare = moneyMovement <= 0
              ? null
              : (expenses / moneyMovement).clamp(0, 1).toDouble();
          final appealProgress = towns.isEmpty || appeals <= 0
              ? null
              : (appeals / (towns.length * 5)).clamp(0, 1).toDouble();
          return PremiumScrollView(
            appBarTitle: 'Overview',
            children: [
              const HeaderBlock(
                title: 'All towns overview',
                subtitle:
                    'One clean command center for every town, accountant request, ledger and balance.',
              ),
              StatusStrip(
                items: [
                  widget.pushStatus,
                  widget.realtimeStatus,
                ].where((e) => e.trim().isNotEmpty).toList(),
              ),
              MetricGrid(
                metrics: [
                  Metric(
                    'Pending appeals',
                    '${d?['appeals'] ?? '-'}',
                    Icons.rule,
                    const Color(0xFF2563EB),
                    progress: appealProgress,
                  ),
                  Metric(
                    'Total received',
                    d == null ? '-' : money.format(d['received']),
                    Icons.trending_up_rounded,
                    const Color(0xFF0F766E),
                  ),
                  Metric(
                    'Cash balance',
                    d == null ? '-' : money.format(d['cash']),
                    Icons.account_balance_wallet,
                    const Color(0xFF2563EB),
                  ),
                  Metric(
                    'Expenses',
                    d == null ? '-' : money.format(d['expenses']),
                    Icons.trending_down_rounded,
                    const Color(0xFFBE123C),
                    progress: expenseShare,
                  ),
                  Metric(
                    'Pending collection',
                    d == null ? '-' : money.format(d['pending']),
                    Icons.pending_actions_rounded,
                    const Color(0xFFB45309),
                    progress: collectionProgress,
                  ),
                  Metric(
                    'Towns tracked',
                    '${towns.length}',
                    Icons.location_city,
                    const Color(0xFF475569),
                  ),
                ],
              ),
              const SectionLabel('Town cards'),
              if (!snap.hasData && !snap.hasError) const SkeletonList(),
              if (snap.hasError)
                ErrorBlock(error: friendlyDbError(snap.error!)),
              for (var i = 0; i < towns.take(4).length; i++)
                AnimatedEntry(
                  index: i,
                  child: TownPulseCard(
                    town: towns[i],
                    onTap: () => openTownDashboard(context, towns[i]),
                  ),
                ),
              if (towns.length > 4)
                FilledButton.icon(
                  onPressed: () => selectedTabNotifier.value = 1,
                  icon: const Icon(Icons.location_city_rounded),
                  label: Text('View all ${towns.length} towns'),
                ),
            ],
          );
        },
      ),
    );
  }
}

void openTownDashboard(BuildContext context, TownPulse town) {
  Navigator.of(context).push(
    premiumRoute(
      DetailScaffold(
        title: town.name,
        child: TownDashboardDetail(town: town),
      ),
    ),
  );
}

class TownPulseCard extends StatelessWidget {
  const TownPulseCard({super.key, required this.town, required this.onTap});
  final TownPulse town;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const VectorBadge(kind: BadgeKind.town, size: 42),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        town.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        town.accountantName.isEmpty
                            ? 'No accountant assigned'
                            : 'Accountant: ${town.accountantName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: kMuted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusPill(
                  status: town.pendingAppeals > 0
                      ? '${town.pendingAppeals} pending'
                      : 'clear',
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                MiniValueChip('Cash', money.format(town.cashBalance)),
                MiniValueChip('Today in', money.format(town.todayIncome)),
                MiniValueChip('Today out', money.format(town.todayExpense)),
                MiniValueChip('Pending', money.format(town.pendingCollection)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MiniValueChip extends StatelessWidget {
  const MiniValueChip(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 124),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: kPrimary.withValues(alpha: .06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kPrimary.withValues(alpha: .10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: kMuted,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: kText,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class TownsOverviewPage extends StatefulWidget {
  const TownsOverviewPage({super.key});

  @override
  State<TownsOverviewPage> createState() => _TownsOverviewPageState();
}

class _TownsOverviewPageState extends State<TownsOverviewPage> {
  late Future<List<TownPulse>> _future;

  @override
  void initState() {
    super.initState();
    _future = loadTownPulses();
  }

  Future<void> _refresh() async {
    final next = loadTownPulses();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<TownPulse>>(
        future: _future,
        builder: (context, snap) {
          final towns = snap.data ?? const <TownPulse>[];
          return PremiumScrollView(
            appBarTitle: 'Town dashboards',
            children: [
              const HeaderBlock(
                title: 'Town dashboards',
                subtitle:
                    'Every town has its own dashboard, accountant identity, balance, ledger and pending requests.',
              ),
              if (!snap.hasData && !snap.hasError) const SkeletonList(),
              if (snap.hasError)
                ErrorBlock(error: friendlyDbError(snap.error!)),
              for (var i = 0; i < towns.length; i++)
                AnimatedEntry(
                  index: i,
                  child: TownPulseCard(
                    town: towns[i],
                    onTap: () => openTownDashboard(context, towns[i]),
                  ),
                ),
              if (snap.hasData && towns.isEmpty)
                const EmptyBlock(text: 'No towns found yet.'),
            ],
          );
        },
      ),
    );
  }
}

class TownDashboardDetail extends StatelessWidget {
  const TownDashboardDetail({super.key, required this.town});
  final TownPulse town;

  Future<List<Map<String, dynamic>>> _loadAppeals() async {
    final data = await supabase
        .from('appeals')
        .select('*, requested_by_user_id(full_name,email,town_name,town_id)')
        .eq('status', 'pending')
        .order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(
      data,
    ).where((a) => appealTownName(a) == town.name).toList();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _loadAppeals(),
      builder: (context, snap) {
        final appeals = snap.data ?? const <Map<String, dynamic>>[];
        final collectionTotal = town.totalReceived + town.pendingCollection;
        final collectionProgress = collectionTotal <= 0
            ? null
            : (town.totalReceived / collectionTotal).clamp(0, 1).toDouble();
        final appealProgress = town.pendingAppeals <= 0
            ? null
            : (town.pendingAppeals / 10).clamp(0, 1).toDouble();
        return PremiumScrollView(
          showAppBar: false,
          children: [
            HeaderBlock(
              title: town.name,
              subtitle: town.accountantName.isEmpty
                  ? 'Town dashboard without assigned accountant name.'
                  : 'Town accountant: ${town.accountantName}',
            ),
            MetricGrid(
              metrics: [
                Metric(
                  'Cash balance',
                  money.format(town.cashBalance),
                  Icons.account_balance_wallet_rounded,
                  kPrimary,
                ),
                Metric(
                  'Today income',
                  money.format(town.todayIncome),
                  Icons.trending_up_rounded,
                  const Color(0xFF0F766E),
                ),
                Metric(
                  'Today expense',
                  money.format(town.todayExpense),
                  Icons.trending_down_rounded,
                  const Color(0xFFBE123C),
                ),
                Metric(
                  'Pending appeals',
                  '${town.pendingAppeals}',
                  Icons.rule_rounded,
                  const Color(0xFFB45309),
                  progress: appealProgress,
                ),
                Metric(
                  'Pending collection',
                  money.format(town.pendingCollection),
                  Icons.pending_actions_rounded,
                  const Color(0xFF7C3AED),
                  progress: collectionProgress,
                ),
                Metric(
                  'Sales count',
                  '${town.salesCount}',
                  Icons.sell_rounded,
                  const Color(0xFF475569),
                ),
              ],
            ),
            const SectionLabel('Pending appeals'),
            if (!snap.hasData && !snap.hasError) const SkeletonList(),
            if (snap.hasError) ErrorBlock(error: friendlyDbError(snap.error!)),
            for (var i = 0; i < appeals.length; i++)
              AnimatedEntry(
                index: i,
                child: AppealInfoCard(row: appeals[i]),
              ),
            if (snap.hasData && appeals.isEmpty)
              const EmptyBlock(text: 'No pending appeals for this town.'),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  premiumRoute(
                    DetailScaffold(
                      title: '${town.name} ledger receipts',
                      child: DailyLedgerReceiptPage(initialTown: town.name),
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.receipt_long_rounded),
              label: const Text('Open town ledger receipts'),
            ),
          ],
        );
      },
    );
  }
}

class AppealInfoCard extends StatelessWidget {
  const AppealInfoCard({super.key, required this.row, this.actions = const []});
  final Map<String, dynamic> row;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final rd = row['requested_data'];
    final data = rd is Map ? rd : const {};
    final requester = row['requested_by_user_id'];
    final user = requester is Map ? requester : const {};
    final amount = data['amount'] ?? data['Amount'] ?? row['amount'];
    final date = data['date'] ?? data['Date'] ?? row['created_at'];
    return InfoCard(
      icon: badgeForStatus('${row['status'] ?? 'pending'}'),
      status: '${row['status'] ?? 'pending'}',
      title: pretty(row['appeal_type']),
      subtitle:
          'Town: ${appealTownName(row).isEmpty ? 'Missing town' : appealTownName(row)}',
      meta:
          'Accountant: ${user['full_name'] ?? 'Unknown'} - ${formatDate(date)}',
      body: [
        if (amount != null) 'Amount: ${money.format(asNum(amount))}',
        safeSummary(row['reason'] ?? data),
      ].where((v) => v.trim().isNotEmpty).join(' - '),
      actions: actions,
    );
  }
}

class ActivityPage extends StatelessWidget {
  const ActivityPage({super.key});

  Future<Map<String, List<Map<String, dynamic>>>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final sales = await supabase
        .from('all_sales')
        .select('*')
        .order('created_at', ascending: false)
        .limit(40);
    final entries = await supabase
        .from('daily_entries')
        .select('*')
        .order('date', ascending: false)
        .limit(40);
    final expenses = await supabase
        .from('expenses')
        .select('*')
        .order('date', ascending: false)
        .limit(40);
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
      builder: (context, snap) => PremiumScrollView(
        showAppBar: false,
        children: [
          const HeaderBlock(
            title: 'Live activity',
            subtitle:
                'Recent sales, accountant entries, and expenses synced from Supabase.',
          ),
          if (snap.hasError) ErrorBlock(error: '${snap.error}'),
          if (!snap.hasData && !snap.hasError) const SkeletonList(),
          for (final s in snap.data?['sales'] ?? [])
            InfoCard(
              title:
                  'Sale - ${money.format(asNum(rowVal(s, 'Total_Amount_PKR')))}',
              subtitle:
                  '${rowVal(s, 'Town_Name') ?? 'Town'} - ${rowVal(s, 'Type') ?? ''} ${rowVal(s, 'Plot_Shop_Number') ?? ''}',
              meta:
                  '${formatDate(rowVal(s, 'Sell_Date'))} - ${rowVal(s, 'Status') ?? 'Sold'}',
              body: 'Agent: ${rowVal(s, 'Agent_Name') ?? '-'}',
            ),
          for (final e in snap.data?['entries'] ?? [])
            InfoCard(
              title:
                  '${rowVal(e, 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(e, 'Amount')))}',
              subtitle:
                  '${rowVal(e, 'Town_Name') ?? 'Town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: formatDate(rowVal(e, 'Date')),
              body: '${rowVal(e, 'Description') ?? ''}',
            ),
          for (final e in snap.data?['expenses'] ?? [])
            InfoCard(
              title:
                  'Expense - ${money.format(asNum(rowVal(e, 'Amount_PKR')))}',
              subtitle:
                  '${rowVal(e, 'Town_Name') ?? 'Town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: formatDate(rowVal(e, 'Date')),
              body:
                  '${rowVal(e, 'Expense_Name') ?? rowVal(e, 'Description') ?? ''}',
            ),
          if (snap.hasData &&
              (snap.data!['sales']!.isEmpty &&
                  snap.data!['entries']!.isEmpty &&
                  snap.data!['expenses']!.isEmpty))
            const EmptyBlock(text: 'No activity found.'),
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
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final data = await supabase
        .from('appeals')
        .select(
          '*, requested_by_user_id(full_name,email,agent_town,agent_towns)',
        )
        .not('appeal_type', 'eq', 'agent_registration')
        .order('created_at', ascending: false);
    var rows = List<Map<String, dynamic>>.from(
      data,
    ).map((row) => {...row, 'status': normalizeStatus(row['status'])}).toList();

    final townless = rows
        .where(
          (row) =>
              row['status'] == 'pending' &&
              requiresTownForAppeal(row) &&
              appealTownName(row).trim().isEmpty,
        )
        .toList();
    for (final row in townless) {
      await supabase
          .rpc(
            'ceo_review_appeal',
            params: {'appeal_id': row['id'], 'new_status': 'rejected'},
          )
          .catchError((_) => null);
    }
    rows = rows
        .where((row) => !townless.any((bad) => bad['id'] == row['id']))
        .where((row) => row['status'] == _filter)
        .toList();
    final seen = <String>{};
    return rows.where((row) => seen.add('${row['id']}')).toList();
  }

  Future<void> _refresh() async {
    try {
      final next = _load();
      setState(() {
        _future = next;
        _items = null;
        _error = null;
      });
      final rows = await next;
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
      final appeal = (_items ?? []).firstWhere(
        (item) => item['id'] == id,
        orElse: () => const <String, dynamic>{},
      );
      if (status == 'approved' &&
          requiresTownForAppeal(appeal) &&
          appealTownName(appeal).trim().isEmpty) {
        throw Exception(
          'Town name missing. Reject this appeal and ask user to submit it with a valid town.',
        );
      }
      final result = await supabase.rpc(
        'ceo_review_appeal',
        params: {'appeal_id': id, 'new_status': status},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Appeal $status: ${result?['message'] ?? 'done'}'),
          ),
        );
        setState(
          () => _items = (_items ?? [])
              .where((item) => item['id'] != id)
              .toList(),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Review failed: ${friendlyDbError(e)}'),
            backgroundColor: const Color(0xFFB91C1C),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.done &&
            snap.hasData &&
            _items == null) {
          _items = snap.data;
        }
        final isFreshLoading =
            _items == null && snap.connectionState != ConnectionState.done;
        final rows = isFreshLoading
            ? const <Map<String, dynamic>>[]
            : _items ?? snap.data ?? const <Map<String, dynamic>>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: PremiumScrollView(
            appBarTitle: 'Approvals',
            children: [
              const HeaderBlock(
                title: 'Approvals',
                subtitle:
                    'Review daily-entry, investor, construction, date-change, salary, and business requests.',
              ),
              FilterChips(
                value: _filter,
                options: const ['pending', 'approved', 'rejected'],
                onChanged: (next) {
                  if (next == _filter) return;
                  setState(() {
                    _filter = next;
                    _items = null;
                    _error = null;
                    _future = _load();
                  });
                },
              ),
              if (_error != null)
                ErrorBlock(error: 'Schema/API issue: $_error'),
              if (isFreshLoading && _error == null) const SkeletonList(),
              for (var i = 0; i < rows.length; i++)
                AnimatedEntry(
                  index: i,
                  child: AppealInfoCard(
                    row: rows[i],
                    actions: [
                      if (_filter == 'pending') ...[
                        OutlinedButton.icon(
                          onPressed: _reviewing
                              ? null
                              : () => _review(rows[i]['id'], 'rejected'),
                          icon: const Icon(Icons.close),
                          label: const Text('Reject'),
                        ),
                        FilledButton.icon(
                          onPressed: _reviewing
                              ? null
                              : () => _review(rows[i]['id'], 'approved'),
                          icon: const Icon(Icons.check),
                          label: const Text('Approve'),
                        ),
                      ],
                    ],
                  ),
                ),
              if (!isFreshLoading && rows.isEmpty && _error == null)
                EmptyBlock(text: 'No $_filter appeals.'),
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
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final data = await supabase
        .from('daily_entries')
        .select('*')
        .order('date', ascending: false)
        .limit(80);
    final rows = List<Map<String, dynamic>>.from(data);
    return rows
        .where(
          (row) => reviewStatusOf(row) == _filter,
        )
        .toList();
  }

  Future<void> _refresh() async {
    try {
      final next = _load();
      setState(() {
        _future = next;
        _items = null;
        _error = null;
      });
      final rows = await next;
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
      dynamic result;
      final uuid = row['id'] ?? row['uuid'];
      final entryId = rowVal(row, 'Entry_ID') ?? row['entry_id'];
      if (uuid != null && '$uuid'.trim().isNotEmpty) {
        result = await supabase.rpc(
          'ceo_review_daily_entry',
          params: {'entry_uuid': uuid, 'new_status': status},
        );
      } else if (entryId != null && '$entryId'.trim().isNotEmpty) {
        await supabase
            .from('daily_entries')
            .update({
              'review_status': status,
              'reviewed_at': DateTime.now().toIso8601String(),
            })
            .eq('entry_id', '$entryId');
        result = {'message': 'updated'};
      } else {
        throw Exception('Entry id missing in cloud row');
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Entry $status: ${result?['message'] ?? 'done'}'),
          ),
        );
        setState(
          () => _items = (_items ?? [])
              .where((item) => dailyEntryStableKey(item) != dailyEntryStableKey(row))
              .toList(),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Entry review failed: ${friendlyDbError(e)}'),
            backgroundColor: const Color(0xFFB91C1C),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.done &&
            snap.hasData &&
            _items == null) {
          _items = snap.data;
        }
        final isFreshLoading =
            _items == null && snap.connectionState != ConnectionState.done;
        final rows = isFreshLoading
            ? const <Map<String, dynamic>>[]
            : _items ?? snap.data ?? const <Map<String, dynamic>>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: PremiumScrollView(
            appBarTitle: 'Daily entries',
            showAppBar: !(ModalRoute.of(context)?.canPop ?? false),
            children: [
              const HeaderBlock(
                title: 'Daily entries review',
                subtitle:
                    'Accountant income and expense entries are visible here. Rejecting marks the entry for office correction; it does not change town prices or inventory.',
              ),
              FilterChips(
                value: _filter,
                options: const ['pending', 'approved', 'rejected'],
                onChanged: (next) {
                  if (next == _filter) return;
                  setState(() {
                    _filter = next;
                    _items = null;
                    _error = null;
                    _future = _load();
                  });
                },
              ),
              if (_error != null)
                ErrorBlock(error: 'Schema/API issue: $_error'),
              if (isFreshLoading && _error == null) const SkeletonList(),
              for (var i = 0; i < rows.length; i++)
                AnimatedEntry(
                  index: i,
                  child: InfoCard(
                    icon: badgeForStatus(
                      reviewStatusOf(rows[i]),
                    ),
                    status: reviewStatusOf(rows[i]),
                    title:
                        '${rowVal(rows[i], 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(rows[i], 'Amount')))}',
                    subtitle:
                        '${rowVal(rows[i], 'Town_Name') ?? 'No town'} - ${rowVal(rows[i], 'Category') ?? 'General'}',
                    meta:
                        '${formatDate(rowVal(rows[i], 'Date'))} - ${reviewStatusOf(rows[i])}',
                    body: '${rowVal(rows[i], 'Description') ?? ''}',
                    actions: [
                      if (_filter == 'pending') ...[
                        OutlinedButton.icon(
                          onPressed: _reviewing
                              ? null
                              : () => _mark(rows[i], 'rejected'),
                          icon: const Icon(Icons.report),
                          label: const Text('Reject'),
                        ),
                        FilledButton.icon(
                          onPressed: _reviewing
                              ? null
                              : () => _mark(rows[i], 'approved'),
                          icon: const Icon(Icons.verified),
                          label: const Text('Approve'),
                        ),
                      ],
                    ],
                  ),
                ),
              if (!isFreshLoading && rows.isEmpty && _error == null)
                EmptyBlock(text: 'No $_filter daily entries.'),
            ],
          ),
        );
      },
    );
  }
}

class DailyLedgerReceiptPage extends StatefulWidget {
  const DailyLedgerReceiptPage({super.key, this.initialTown});
  final String? initialTown;

  @override
  State<DailyLedgerReceiptPage> createState() => _DailyLedgerReceiptPageState();
}

class _DailyLedgerReceiptPageState extends State<DailyLedgerReceiptPage> {
  DateTime _date = DateTime.now();

  Future<List<LedgerReceipt>> _loadReceipts() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    final day = DateFormat('yyyy-MM-dd').format(_date);
    final data = await supabase
        .from('daily_entries')
        .select('*')
        .order('created_at', ascending: false);
    final rows = List<Map<String, dynamic>>.from(
      data,
    ).where((row) {
      final status = reviewStatusOf(row);
      return '${rowVal(row, 'Date')}'.startsWith(day) &&
          status != 'pending' &&
          status != 'rejected';
    }).toList();
    final townNames =
        rows
            .map((row) => '${rowVal(row, 'Town_Name')}'.trim())
            .where((name) => name.isNotEmpty && name != 'null')
            .toSet()
            .toList()
          ..sort();
    final receipts = townNames.map((town) {
      final townRows = rows
          .where((row) => '${rowVal(row, 'Town_Name')}'.trim() == town)
          .toList();
      return LedgerReceipt(
        townName: town,
        date: _date,
        incomeRows: townRows
            .where((row) => '${rowVal(row, 'Type')}'.toLowerCase() == 'income')
            .toList(),
        expenseRows: townRows
            .where((row) => '${rowVal(row, 'Type')}'.toLowerCase() == 'expense')
            .toList(),
      );
    }).toList();
    if (widget.initialTown == null || widget.initialTown!.trim().isEmpty) {
      return receipts;
    }
    return receipts.where((r) => r.townName == widget.initialTown).toList();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final inDetailRoute = ModalRoute.of(context)?.canPop ?? false;
    return FutureBuilder<List<LedgerReceipt>>(
      future: _loadReceipts(),
      builder: (context, snap) {
        final receipts = snap.data ?? const <LedgerReceipt>[];
        final income = receipts.fold<num>(
          0,
          (sum, receipt) => sum + receipt.income,
        );
        final expense = receipts.fold<num>(
          0,
          (sum, receipt) => sum + receipt.expense,
        );
        final movement = income + expense;
        final incomeShare = movement <= 0
            ? null
            : (income / movement).clamp(0, 1).toDouble();
        final expenseShare = movement <= 0
            ? null
            : (expense / movement).clamp(0, 1).toDouble();
        return RefreshIndicator(
          onRefresh: () async => (context as Element).markNeedsBuild(),
          child: PremiumScrollView(
            appBarTitle: widget.initialTown == null
                ? 'Daily ledger'
                : '${widget.initialTown} ledger',
            showAppBar: !inDetailRoute,
            children: [
              HeaderBlock(
                title: widget.initialTown == null
                    ? 'Daily ledger receipts'
                    : '${widget.initialTown} receipts',
                subtitle:
                    'Date-wise town receipt list for ${shortDate.format(_date)}.',
              ),
              OutlinedButton.icon(
                onPressed: _pickDate,
                icon: const Icon(Icons.calendar_month_rounded),
                label: Text(shortDate.format(_date)),
              ),
              if (snap.hasError)
                ErrorBlock(error: friendlyDbError(snap.error!)),
              if (!snap.hasData && !snap.hasError) const SkeletonList(),
              if (snap.hasData)
                MetricGrid(
                  metrics: [
                    Metric(
                      'Towns',
                      '${receipts.length}',
                      Icons.location_city_rounded,
                      kPrimary,
                    ),
                    Metric(
                      'Income',
                      money.format(income),
                      Icons.trending_up_rounded,
                      const Color(0xFF0F766E),
                      progress: incomeShare,
                    ),
                    Metric(
                      'Expenses',
                      money.format(expense),
                      Icons.trending_down_rounded,
                      const Color(0xFFBE123C),
                      progress: expenseShare,
                    ),
                    Metric(
                      'Net',
                      money.format(income - expense),
                      Icons.account_balance_wallet_rounded,
                      const Color(0xFF2563EB),
                    ),
                  ],
                ),
              const SectionLabel('Town receipts'),
              for (var i = 0; i < receipts.length; i++)
                AnimatedEntry(
                  index: i,
                  child: LedgerReceiptCard(receipt: receipts[i]),
                ),
              if (snap.hasData && receipts.isEmpty)
                const EmptyBlock(
                  text: 'No ledger receipts found for this date.',
                ),
            ],
          ),
        );
      },
    );
  }
}

class LedgerReceiptCard extends StatelessWidget {
  const LedgerReceiptCard({super.key, required this.receipt});
  final LedgerReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      icon: const VectorBadge(kind: BadgeKind.money, size: 24),
      title: receipt.townName,
      subtitle:
          'Income ${money.format(receipt.income)} - Expenses ${money.format(receipt.expense)}',
      meta: '${shortDate.format(receipt.date)} - ${receipt.count} entries',
      body: 'Net ${money.format(receipt.net)}',
      actions: [
        OutlinedButton.icon(
          onPressed: () => Navigator.of(context).push(
            premiumRoute(
              DetailScaffold(
                title: '${receipt.townName} receipt',
                child: LedgerReceiptDetailPage(receipt: receipt),
              ),
            ),
          ),
          icon: const Icon(Icons.open_in_new_rounded),
          label: const Text('Open'),
        ),
      ],
    );
  }
}

class LedgerReceiptDetailPage extends StatelessWidget {
  const LedgerReceiptDetailPage({super.key, required this.receipt});
  final LedgerReceipt receipt;

  Future<void> _sharePdf() async {
    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        build: (_) => [
          pw.Text(
            'AL SIRAJ DEVELOPERS',
            style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 8),
          pw.Text('Daily Ledger Receipt - ${receipt.townName}'),
          pw.Text(shortDate.format(receipt.date)),
          pw.SizedBox(height: 16),
          pw.Text('Income: ${money.format(receipt.income)}'),
          pw.Text('Expenses: ${money.format(receipt.expense)}'),
          pw.Text('Net: ${money.format(receipt.net)}'),
          pw.SizedBox(height: 16),
          pw.Text(
            'Income Entries',
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
          ),
          ...receipt.incomeRows.map(
            (row) => pw.Text(
              '${rowVal(row, 'Description') ?? ''} - ${money.format(asNum(rowVal(row, 'Amount')))}',
            ),
          ),
          pw.SizedBox(height: 12),
          pw.Text(
            'Expense Entries',
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
          ),
          ...receipt.expenseRows.map(
            (row) => pw.Text(
              '${rowVal(row, 'Description') ?? ''} - ${money.format(asNum(rowVal(row, 'Amount')))}',
            ),
          ),
        ],
      ),
    );
    await Printing.sharePdf(
      bytes: await doc.save(),
      filename:
          'al-siraj-${receipt.townName}-${DateFormat('yyyy-MM-dd').format(receipt.date)}.pdf',
    );
  }

  @override
  Widget build(BuildContext context) {
    final movement = receipt.income + receipt.expense;
    final incomeShare = movement <= 0
        ? null
        : (receipt.income / movement).clamp(0, 1).toDouble();
    final expenseShare = movement <= 0
        ? null
        : (receipt.expense / movement).clamp(0, 1).toDouble();
    return PremiumScrollView(
      showAppBar: false,
      children: [
        HeaderBlock(
          title: receipt.townName,
          subtitle: 'Full receipt for ${shortDate.format(receipt.date)}.',
        ),
        FilledButton.icon(
          onPressed: _sharePdf,
          icon: const Icon(Icons.picture_as_pdf_rounded),
          label: const Text('Download PDF'),
        ),
        MetricGrid(
          metrics: [
            Metric(
              'Income',
              money.format(receipt.income),
              Icons.trending_up_rounded,
              const Color(0xFF0F766E),
              progress: incomeShare,
            ),
            Metric(
              'Expenses',
              money.format(receipt.expense),
              Icons.trending_down_rounded,
              const Color(0xFFBE123C),
              progress: expenseShare,
            ),
            Metric(
              'Net',
              money.format(receipt.net),
              Icons.account_balance_wallet_rounded,
              kPrimary,
            ),
            Metric(
              'Entries',
              '${receipt.count}',
              Icons.receipt_long_rounded,
              const Color(0xFF7C3AED),
            ),
          ],
        ),
        const SectionLabel('Income entries'),
        if (receipt.incomeRows.isEmpty)
          const EmptyBlock(text: 'No income entered for this town.'),
        for (var i = 0; i < receipt.incomeRows.length; i++)
          AnimatedEntry(
            index: i,
            child: _LedgerEntryCard(row: receipt.incomeRows[i], positive: true),
          ),
        const SectionLabel('Expense entries'),
        if (receipt.expenseRows.isEmpty)
          const EmptyBlock(text: 'No expenses entered for this town.'),
        for (var i = 0; i < receipt.expenseRows.length; i++)
          AnimatedEntry(
            index: i,
            child: _LedgerEntryCard(
              row: receipt.expenseRows[i],
              positive: false,
            ),
          ),
      ],
    );
  }
}

class _LedgerEntryCard extends StatelessWidget {
  const _LedgerEntryCard({required this.row, required this.positive});
  final Map<String, dynamic> row;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    return InfoCard(
      icon: VectorBadge(
        kind: positive ? BadgeKind.money : BadgeKind.alert,
        size: 24,
      ),
      title:
          '${positive ? '+' : '-'} ${money.format(asNum(rowVal(row, 'Amount')))}',
      subtitle:
          '${rowVal(row, 'Town_Name') ?? 'No town'} - ${rowVal(row, 'Category') ?? 'General'}',
      meta:
          '${formatDate(rowVal(row, 'Date'))} - ${reviewStatusOf(row)}',
      body: '${rowVal(row, 'Description') ?? ''}',
    );
  }
}

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  Future<List<Map<String, dynamic>>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final data = await supabase
        .from('notifications')
        .select('*')
        .eq('dismissed', 'No')
        .order('created_date', ascending: false)
        .limit(80);
    return List<Map<String, dynamic>>.from(data);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => PremiumScrollView(
        showAppBar: false,
        children: [
          const HeaderBlock(
            title: 'Notifications',
            subtitle:
                'Installment, file, and business alerts for CEO attention.',
          ),
          if (!snap.hasData) const SkeletonList(),
          for (final n in snap.data ?? [])
            InfoCard(
              title: '${rowVal(n, 'Type') ?? 'Alert'}',
              subtitle:
                  '${rowVal(n, 'Town_Name') ?? ''} ${rowVal(n, 'Plot_Shop_Number') ?? ''}',
              meta: formatDate(rowVal(n, 'Created_Date')),
              body: '${rowVal(n, 'Message') ?? ''}',
            ),
          if (snap.hasData && snap.data!.isEmpty)
            const EmptyBlock(text: 'No active notifications.'),
        ],
      ),
    );
  }
}

class TownsPage extends StatelessWidget {
  const TownsPage({super.key});

  Future<List<Map<String, dynamic>>> _load() async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    final data = await supabase.from('towns').select('*').order('town_name');
    return List<Map<String, dynamic>>.from(data);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _load(),
      builder: (context, snap) => PremiumScrollView(
        showAppBar: false,
        children: [
          const HeaderBlock(
            title: 'Balance enquiries',
            subtitle:
                'Read-only town performance. Price and inventory editing is not available on mobile.',
          ),
          if (!snap.hasData) const SkeletonList(),
          for (final t in snap.data ?? [])
            InfoCard(
              title: '${rowVal(t, 'Town_Name') ?? 'Town'}',
              subtitle:
                  'Profit/Loss: ${money.format(asNum(rowVal(t, 'Profit_Loss')))}',
              meta:
                  'Income ${money.format(asNum(rowVal(t, 'Total_Income_PKR')))} - Expenses ${money.format(asNum(rowVal(t, 'Total_Expenses_PKR')))}',
              body:
                  'Plots ${rowVal(t, 'Total_Plots') ?? 0} - Shops ${rowVal(t, 'Total_Shops') ?? 0} - Status ${rowVal(t, 'Status') ?? 'Active'}',
            ),
          if (snap.hasData && snap.data!.isEmpty)
            const EmptyBlock(text: 'No towns found.'),
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
      MoreItem(
        'Live activity',
        'Sales, expenses, and synced business movement.',
        const VectorBadge(kind: BadgeKind.activity),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Live activity',
                child: ActivityPage(),
              ),
            ),
          );
        },
      ),
      MoreItem(
        'Notifications',
        'In-app business notices. Push alerts are limited to approvals.',
        const VectorBadge(kind: BadgeKind.alert),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Notifications',
                child: NotificationsPage(),
              ),
            ),
          );
        },
      ),
      MoreItem(
        'Daily entries review',
        'Approve or reject accountant income and expense entries.',
        const VectorBadge(kind: BadgeKind.entry),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Daily entries review',
                child: DailyEntriesPage(),
              ),
            ),
          );
        },
      ),
      MoreItem(
        'Daily ledger receipt',
        'Today\'s full income and expense receipt.',
        const VectorBadge(kind: BadgeKind.money),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Daily ledger receipt',
                child: DailyLedgerReceiptPage(),
              ),
            ),
          );
        },
      ),
      MoreItem(
        'Balance enquiries',
        'Read-only town performance and balances.',
        const VectorBadge(kind: BadgeKind.town),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Balance enquiries',
                child: TownsPage(),
              ),
            ),
          );
        },
      ),
      MoreItem(
        'Logout',
        'Sign out from this CEO device.',
        const VectorBadge(kind: BadgeKind.reject),
        () {
          supabase.auth.signOut();
        },
      ),
    ];

    return PremiumScrollView(
      appBarTitle: 'More',
      children: [
        const HeaderBlock(
          title: 'More',
          subtitle:
              'Secondary CEO tools grouped here to keep the phone navigation compact.',
        ),
        for (var i = 0; i < items.length; i++)
          AnimatedEntry(
            index: i,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassCard(
                onTap: items[i].onTap,
                child: Row(
                  children: [
                    items[i].icon,
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            items[i].title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            items[i].subtitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: kMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: kMuted),
                  ],
                ),
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

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 10, bottom: 10),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: kText,
          fontSize: 15,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class DetailScaffold extends StatelessWidget {
  const DetailScaffold({super.key, required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const PremiumBackground(),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: GlassCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 8,
                    ),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.arrow_back_rounded),
                        ),
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(child: child),
              ],
            ),
          ),
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
    final width = MediaQuery.sizeOf(context).width;
    final titleSize = width < 340 ? 24.0 : 28.0;
    return Hero(
          tag: 'header-$title',
          child: Material(
            color: Colors.transparent,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      gradient: const LinearGradient(
                        colors: [Color(0xFF2563EB), kSecondary],
                      ),
                    ),
                  ),
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: titleSize,
                      fontWeight: FontWeight.w900,
                      height: 1.02,
                      color: kText,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: kMuted,
                      height: 1.45,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        )
        .animate()
        .fadeIn(duration: 420.ms)
        .slideY(begin: .12, curve: Curves.easeOutCubic);
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
        children: items
            .map(
              (item) => Container(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width - 48,
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: kPrimary.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: kPrimary.withValues(alpha: .16)),
                ),
                child: Text(
                  item,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: kPrimary,
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class ErrorBlock extends StatelessWidget {
  const ErrorBlock({super.key, required this.error});
  final String error;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Text(
        error,
        style: const TextStyle(
          color: Color(0xFF991B1B),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class Metric {
  const Metric(this.label, this.value, this.icon, this.color, {this.progress});
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double? progress;
}

class MetricGrid extends StatelessWidget {
  const MetricGrid({super.key, required this.metrics});
  final List<Metric> metrics;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth < 430 ? 1 : 2;
        final narrow = columns == 1;
        final aspectRatio = narrow ? 2.0 : 0.86;
        return AnimationLimiter(
          child: GridView.count(
            crossAxisCount: columns,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: aspectRatio,
            children: [
              for (var i = 0; i < metrics.length; i++)
                AnimationConfiguration.staggeredGrid(
                  position: i,
                  duration: const Duration(milliseconds: 460),
                  columnCount: columns,
                  child: SlideAnimation(
                    verticalOffset: 22,
                    curve: Curves.easeOutCubic,
                    child: FadeInAnimation(
                      child: GlassCard(
                        heroTag: 'metric-${metrics[i].label}',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            GradientIconBox(
                              icon: metrics[i].icon,
                              size: narrow ? 38 : 42,
                              colors: [
                                metrics[i].color,
                                metrics[i].color.withValues(alpha: .62),
                              ],
                            ),
                            SizedBox(height: narrow ? 12 : 18),
                            Text(
                              metrics[i].value,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: narrow ? 19 : 22,
                                fontWeight: FontWeight.w900,
                                color: kText,
                              ),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              metrics[i].label,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: kMuted,
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                            if ((metrics[i].progress ?? 0) > 0) ...[
                              const SizedBox(height: 10),
                              PremiumProgress(
                                percent: metrics[i].progress!,
                                color: metrics[i].color,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.body,
    this.actions = const [],
    this.icon,
    this.status,
  });
  final String title;
  final String subtitle;
  final String meta;
  final String body;
  final List<Widget> actions;
  final Widget? icon;
  final String? status;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child:
          GlassCard(
                onTap: () {},
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (icon != null) ...[
                          icon!,
                          const SizedBox(width: 10),
                        ] else ...[
                          const GradientIconBox(
                            icon: Icons.layers_rounded,
                            size: 42,
                            colors: [kPrimary, Color(0xFF8A84FF)],
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: kText,
                            ),
                          ),
                        ),
                        if (status != null) StatusPill(status: status!),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: kText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      meta,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: kMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (body.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        body,
                        maxLines: 5,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: kMuted, height: 1.4),
                      ),
                    ],
                    if (actions.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final actionWidth = constraints.maxWidth < 340
                              ? constraints.maxWidth
                              : 168.0;
                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: actions
                                .map(
                                  (action) => ConstrainedBox(
                                    constraints: BoxConstraints(
                                      maxWidth: actionWidth,
                                    ),
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      alignment: Alignment.centerLeft,
                                      child: action,
                                    ),
                                  ),
                                )
                                .toList(),
                          );
                        },
                      ),
                    ],
                  ],
                ),
              )
              .animate()
              .fadeIn(duration: 360.ms)
              .slideY(begin: .08, curve: Curves.easeOutCubic),
    );
  }
}

class LegacyInfoCard extends StatelessWidget {
  const LegacyInfoCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.body,
    this.actions = const [],
    this.icon,
    this.status,
  });
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (icon != null) ...[icon!, const SizedBox(width: 10)],
                Expanded(
                  child: Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                if (status != null) StatusPill(status: status!),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              meta,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
            ),
            if (body.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(body, maxLines: 5, overflow: TextOverflow.ellipsis),
            ],
            if (actions.isNotEmpty) ...[
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final actionWidth = constraints.maxWidth < 340
                      ? constraints.maxWidth
                      : 168.0;
                  return Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: actions
                        .map(
                          (action) => ConstrainedBox(
                            constraints: BoxConstraints(maxWidth: actionWidth),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: action,
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ],
        ),
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
      child: Center(
        child: Column(
          children: [
            Container(
              width: 112,
              height: 112,
              decoration: BoxDecoration(
                color: kSecondary.withValues(alpha: .10),
                borderRadius: BorderRadius.circular(34),
                border: Border.all(color: kSecondary.withValues(alpha: .22)),
              ),
              child: const Center(
                child: VectorBadge(kind: BadgeKind.activity, size: 62),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: kMuted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
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
      constraints: const BoxConstraints(maxWidth: 96),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        clean,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class FilterChips extends StatelessWidget {
  const FilterChips({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
  });
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
            labelStyle: TextStyle(
              fontWeight: FontWeight.w900,
              color: selected ? Colors.white : const Color(0xFF0F172A),
            ),
            selectedColor: const Color(0xFF0F766E),
            backgroundColor: Colors.white,
            side: BorderSide(
              color: selected
                  ? const Color(0xFF0F766E)
                  : const Color(0xFFE2E8F0),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
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
    return Shimmer.fromColors(
      baseColor: const Color(0xFFE9EDF5),
      highlightColor: Colors.white,
      child: Column(
        children: List.generate(
          3,
          (i) => AnimatedEntry(
            index: i,
            child: GlassCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  skeletonLine(width: 180, height: 16),
                  const SizedBox(height: 12),
                  skeletonLine(width: double.infinity, height: 12),
                  const SizedBox(height: 9),
                  skeletonLine(width: 120, height: 12),
                ],
              ),
            ),
          ),
        ),
      ),
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
        child: Transform.translate(
          offset: Offset(0, 10 * (1 - value)),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

enum BadgeKind {
  brand,
  money,
  alert,
  approve,
  reject,
  pending,
  town,
  activity,
  entry,
}

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
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size * 0.34),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: CustomPaint(
        painter: BadgePainter(kind: kind, color: color),
      ),
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
      canvas.drawLine(
        Offset(size.width * 0.34, size.height * 0.52),
        Offset(size.width * 0.46, size.height * 0.64),
        p,
      );
      canvas.drawLine(
        Offset(size.width * 0.46, size.height * 0.64),
        Offset(size.width * 0.68, size.height * 0.38),
        p,
      );
      return;
    }
    if (kind == BadgeKind.reject) {
      canvas.drawCircle(c, r, p);
      canvas.drawLine(
        Offset(size.width * 0.38, size.height * 0.38),
        Offset(size.width * 0.62, size.height * 0.62),
        p,
      );
      canvas.drawLine(
        Offset(size.width * 0.62, size.height * 0.38),
        Offset(size.width * 0.38, size.height * 0.62),
        p,
      );
      return;
    }
    if (kind == BadgeKind.pending) {
      canvas.drawCircle(c, r, p);
      canvas.drawLine(c, Offset(size.width * 0.50, size.height * 0.34), p);
      canvas.drawLine(c, Offset(size.width * 0.64, size.height * 0.56), p);
      return;
    }

    final rect = Rect.fromCenter(
      center: c,
      width: size.width * 0.48,
      height: size.height * 0.38,
    );
    if (kind == BadgeKind.money) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(size.width * 0.08)),
        p,
      );
      canvas.drawCircle(c, size.width * 0.08, p);
      return;
    }
    if (kind == BadgeKind.town || kind == BadgeKind.brand) {
      canvas.drawRect(
        Rect.fromLTWH(
          size.width * 0.32,
          size.height * 0.28,
          size.width * 0.36,
          size.height * 0.46,
        ),
        p,
      );
      canvas.drawLine(
        Offset(size.width * 0.42, size.height * 0.74),
        Offset(size.width * 0.42, size.height * 0.60),
        p,
      );
      canvas.drawLine(
        Offset(size.width * 0.58, size.height * 0.74),
        Offset(size.width * 0.58, size.height * 0.60),
        p,
      );
      return;
    }
    if (kind == BadgeKind.alert) {
      final path = Path()
        ..moveTo(size.width * 0.50, size.height * 0.24)
        ..lineTo(size.width * 0.72, size.height * 0.68)
        ..lineTo(size.width * 0.28, size.height * 0.68)
        ..close();
      canvas.drawPath(path, p);
      canvas.drawLine(
        Offset(size.width * 0.50, size.height * 0.42),
        Offset(size.width * 0.50, size.height * 0.54),
        p,
      );
      return;
    }

    canvas.drawCircle(c, r, p);
    canvas.drawLine(
      Offset(size.width * 0.36, size.height * 0.50),
      Offset(size.width * 0.64, size.height * 0.50),
      p,
    );
    canvas.drawLine(
      Offset(size.width * 0.50, size.height * 0.36),
      Offset(size.width * 0.50, size.height * 0.64),
      p,
    );
  }

  @override
  bool shouldRepaint(covariant BadgePainter oldDelegate) =>
      oldDelegate.kind != kind || oldDelegate.color != color;
}

Widget badgeForStatus(String status) {
  final clean = status.toLowerCase();
  if (clean == 'approved') {
    return const VectorBadge(kind: BadgeKind.approve, size: 24);
  }
  if (clean == 'rejected') {
    return const VectorBadge(kind: BadgeKind.reject, size: 24);
  }
  return const VectorBadge(kind: BadgeKind.pending, size: 24);
}

class CeoNotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;
  static final Set<String> _shownMessageKeys = <String>{};

  static Future<void> init() async {
    if (_initialized) return;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Karachi'));
    const android = AndroidInitializationSettings(
      '@drawable/ic_stat_ceo_notification',
    );
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        final route = response.payload;
        if (route != null) routeFromPushData({'route': route});
      },
      onDidReceiveBackgroundNotificationResponse: ceoNotificationTapBackground,
    );
    final launchDetails = await _plugin.getNotificationAppLaunchDetails();
    final launchPayload = launchDetails?.notificationResponse?.payload;
    if (launchDetails?.didNotificationLaunchApp == true &&
        launchPayload != null) {
      routeFromPushData({'route': launchPayload});
    }
    final androidPlugin = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'ceo_live_alerts',
        'CEO Live Alerts',
        description: 'Pending appeal alerts for CEO review.',
        importance: Importance.high,
      ),
    );
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'ceo_daily_ledger',
        'Daily Ledger Receipt',
        description: 'Daily 8 PM income and expense ledger receipt.',
        importance: Importance.high,
      ),
    );
    await androidPlugin?.requestNotificationsPermission();
    await scheduleDailyLedgerReceipt();
    _initialized = true;
  }

  static Future<bool> showFromRemoteMessage(RemoteMessage message) async {
    if ('${message.data['table']}'.trim() != 'appeals') return false;
    if ('${message.data['status'] ?? 'pending'}'.toLowerCase() != 'pending') {
      return false;
    }
    if (!_isFreshMessage(message)) return false;

    final messageKey = _messageDedupeKey(message);
    if (!_shownMessageKeys.add(messageKey)) return false;
    if (_shownMessageKeys.length > 200) {
      _shownMessageKeys.clear();
      _shownMessageKeys.add(messageKey);
    }
    final title =
        message.notification?.title ??
        message.data['title'] ??
        titleForTable(message.data['table']);
    final body =
        message.notification?.body ??
        message.data['body'] ??
        'Open CEO app for details';
    final route = message.data['route'] ?? routeForTable(message.data['table']);
    await show(title, body, payload: route);
    return true;
  }

  static bool _isFreshMessage(RemoteMessage message) {
    final now = DateTime.now();
    final sentTime = message.sentTime;
    if (sentTime != null) {
      if (sentTime.isBefore(
        appStartedAt.subtract(const Duration(seconds: 30)),
      )) {
        return false;
      }
      if (now.difference(sentTime) > pushFreshnessWindow) return false;
    }

    final eventTime = _parsePushTime(
      message.data['event_time'] ??
          message.data['created_at'] ??
          message.data['updated_at'],
    );
    if (eventTime != null && now.difference(eventTime) > pushFreshnessWindow) {
      return false;
    }
    return true;
  }

  static String _messageDedupeKey(RemoteMessage message) {
    final data = message.data;
    final stableKey = data['dedupe_key'];
    if (stableKey != null && '$stableKey'.trim().isNotEmpty) {
      return '$stableKey';
    }
    final table = data['table'] ?? '';
    final event = data['event'] ?? '';
    final id = data['id'] ?? '';
    final route = data['route'] ?? '';
    if ('$table$event$id$route'.trim().isNotEmpty) {
      return '$table:$event:$id:$route';
    }
    return message.messageId ??
        DateTime.now().millisecondsSinceEpoch.toString();
  }

  static DateTime? _parsePushTime(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse('$value')?.toLocal();
  }

  static Future<void> show(String title, String body, {String? payload}) async {
    const android = AndroidNotificationDetails(
      'ceo_live_alerts',
      'CEO Live Alerts',
      channelDescription: 'Pending appeal alerts for CEO review.',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_stat_ceo_notification',
      largeIcon: DrawableResourceAndroidBitmap('app_icon'),
    );
    const details = NotificationDetails(android: android);
    final id = DateTime.now().millisecondsSinceEpoch.remainder(1000000);
    await _plugin.show(id, title, body, details, payload: payload);
  }

  static Future<void> scheduleDailyLedgerReceipt() async {
    const android = AndroidNotificationDetails(
      'ceo_daily_ledger',
      'Daily Ledger Receipt',
      channelDescription: 'Daily 8 PM income and expense ledger receipt.',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_stat_ceo_notification',
      largeIcon: DrawableResourceAndroidBitmap('app_icon'),
      category: AndroidNotificationCategory.reminder,
    );
    const details = NotificationDetails(android: android);
    await _plugin.zonedSchedule(
      800200,
      'Daily receipt ledger is ready',
      'Daily receipt ledger of all towns has been fully created.',
      _nextEightPm(),
      details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: 'daily_report',
    );
  }

  static tz.TZDateTime _nextEightPm() {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, 20);
    if (!scheduled.isAfter(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }
}

num asNum(dynamic value) {
  if (value is num) return value;
  return num.tryParse('${value ?? 0}') ?? 0;
}

String pretty(dynamic value) => '${value ?? ''}'.replaceAll('_', ' ').trim();

String normalizeStatus(dynamic status) {
  final clean = '${status ?? 'pending'}'.trim().toLowerCase();
  if (clean == 'approved' || clean == 'rejected') return clean;
  return 'pending';
}

String reviewStatusOf(Map<String, dynamic> row) {
  final raw = rowVal(row, 'Review_Status') ??
      row['review_status'] ??
      row['status'] ??
      row['Status'];
  final text = '${raw ?? ''}'.trim().toLowerCase();
  if (text.isEmpty || text == 'null') return 'approved';
  return normalizeStatus(raw);
}

String dailyEntryStableKey(Map<String, dynamic> row) {
  final value = row['id'] ??
      row['uuid'] ??
      rowVal(row, 'Entry_ID') ??
      row['entry_id'] ??
      rowVal(row, 'Reference') ??
      '';
  return '$value';
}

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
  if ('$route' == 'daily_report') {
    selectedTabNotifier.value = 3;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final nav = appNavigatorKey.currentState;
      if (nav == null) return;
      nav.push(
        premiumRoute(
          const DetailScaffold(
            title: 'Daily ledger receipt',
            child: DailyLedgerReceiptPage(),
          ),
        ),
      );
    });
    return;
  }
  final nextTab = switch ('$route') {
    'towns' => 1,
    'appeals' => 2,
    'entries' => 4,
    'activity' || 'notifications' => 4,
    _ => 0,
  };
  selectedTabNotifier.value = nextTab;
}

dynamic rowVal(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
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
  return raw
      .replaceAll(RegExp(r'PostgrestException\(message: ?'), '')
      .replaceAll(RegExp(r'\)$'), '');
}

String safeSummary(dynamic value) {
  if (value == null) return '';
  if (value is Map) {
    final safeKeys = [
      'townName',
      'Town_Name',
      'town_name',
      'type',
      'Type',
      'category',
      'Category',
      'date',
      'amount',
    ];
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

String appealTownName(Map<String, dynamic> appeal) {
  final rd = appeal['requested_data'];
  final data = rd is Map ? rd : const {};
  final profile = appeal['requested_by_user_id'];
  final user = profile is Map ? profile : const {};
  return '${data['townName'] ?? data['Town_Name'] ?? data['town_name'] ?? data['town'] ?? data['Town'] ?? appeal['town_name'] ?? user['agent_town'] ?? user['agent_towns'] ?? ''}'
      .trim();
}

bool requiresTownForAppeal(Map<String, dynamic> appeal) {
  const types = {
    'agent_registration',
    'backdated_daily_entry',
    'future_daily_entry',
    'date_change',
    'date_change_otp',
    'custom_installment_plan',
    'property_access_request',
    'salary_increase',
    'delete_employee',
  };
  return types.contains('${appeal['appeal_type']}');
}

@pragma('vm:entry-point')
void ceoNotificationTapBackground(NotificationResponse response) {
  final route = response.payload;
  if (route != null) routeFromPushData({'route': route});
}
