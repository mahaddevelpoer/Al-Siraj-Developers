import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:responsive_framework/responsive_framework.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'approval_helpers.dart';
import 'approval_service.dart';
import 'app_performance.dart';
import 'app_theme.dart';
import 'inbox_repository.dart';
import 'realtime_subscription_manager.dart';
import 'receipt_repository.dart';
import 'town_repository.dart'
    show
        ActivityRows,
        OperatorPresence,
        TownPulse,
        loadActiveTownRows,
        loadActivityRows,
        loadOperatorPresenceRows,
        loadTownPulseRows;
import 'widgets/brand_widgets.dart';
import 'widgets/premium_foundation.dart';
import 'widgets/vector_badges.dart';

const supabaseUrl = 'https://wdislbdftnwmaexqtfmn.supabase.co';
const _fullAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc';
const ceoPushTopic = 'ceo-alerts';
const pushFreshnessWindow = Duration(minutes: 5);

final appNavigatorKey = GlobalKey<NavigatorState>();
final selectedTabNotifier = ValueNotifier<int>(0);
final liveRefreshNotifier = ValueNotifier<int>(0);
final appStartedAt = DateTime.now();
const startupSplashDuration = Duration.zero;
const reviewListLimit = 40;
Future<void>? _firebaseStartupFuture;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ErrorWidget.builder = (details) => SafeFlutterErrorScreen(
    message: friendlyDbError(details.exception),
  );
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };
  try {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: _fullAnonKey,
    ).timeout(const Duration(seconds: 4));
  } catch (e) {
    runApp(StartupFailureApp(error: e));
    return;
  }
  _firebaseStartupFuture = _initFirebaseAndNotifications();
  runApp(const CeoMobileApp());
}

Future<void> _initFirebaseAndNotifications() async {
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 4));
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await CeoNotificationService.init().timeout(const Duration(seconds: 4));
  } catch (_) {
    // Push is best-effort. The app must still open for CEO login and reviews.
  }
}

Future<void> ensureFirebaseReady() {
  return _firebaseStartupFuture ?? Future<void>.value();
}

final supabase = Supabase.instance.client;
final money = NumberFormat.currency(
  locale: 'en_PK',
  symbol: 'PKR ',
  decimalDigits: 0,
);
final shortDate = DateFormat('dd MMM yyyy');

class StartupFailureApp extends StatelessWidget {
  const StartupFailureApp({super.key, required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: kBg,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AppBrandMark(size: 92),
                  const SizedBox(height: 20),
                  const Text(
                    'Startup check failed',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: kText,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    friendlyDbError(error),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: kMuted,
                      fontWeight: FontWeight.w700,
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

class SafeFlutterErrorScreen extends StatelessWidget {
  const SafeFlutterErrorScreen({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: ui.TextDirection.ltr,
      child: Material(
        color: kBg,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final maxWidth = constraints.maxWidth.clamp(240.0, 520.0);
              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(18),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    child: Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: const Color(0xFFFECACA)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: .08),
                            blurRadius: 24,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const AppBrandMark(size: 64),
                          const SizedBox(height: 14),
                          const Text(
                            'Screen needs refresh',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: kText,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            breakLongText(message),
                            textAlign: TextAlign.center,
                            softWrap: true,
                            style: const TextStyle(
                              color: Color(0xFF991B1B),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
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

class CeoInboxItem {
  const CeoInboxItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.body,
    required this.route,
    required this.createdAt,
    this.icon = const VectorBadge(kind: BadgeKind.alert, size: 24),
  });

  final String id;
  final String title;
  final String subtitle;
  final String meta;
  final String body;
  final String route;
  final DateTime createdAt;
  final Widget icon;
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
      home: const StartupSplashGate(),
      scrollBehavior: const SmoothAppScrollBehavior(),
      builder: (context, child) {
        final media = MediaQuery.of(context);
        final maxScale = media.size.width < 360
            ? .96
            : media.size.width < 420
            ? 1.06
            : 1.14;
        final scale = media.textScaler.scale(1).clamp(0.86, maxScale).toDouble();
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
  Set<ui.PointerDeviceKind> get dragDevices => {
    ui.PointerDeviceKind.touch,
    ui.PointerDeviceKind.mouse,
    ui.PointerDeviceKind.trackpad,
    ui.PointerDeviceKind.stylus,
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

class StartupSplashGate extends StatefulWidget {
  const StartupSplashGate({super.key});

  @override
  State<StartupSplashGate> createState() => _StartupSplashGateState();
}

class _StartupSplashGateState extends State<StartupSplashGate> {
  bool _done = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (startupSplashDuration.inMilliseconds > 0) {
      _done = false;
      _timer = Timer(startupSplashDuration, () {
        if (mounted) setState(() => _done = true);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: Duration.zero,
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: _done ? const AuthGate() : const StartupSplashScreen(),
    );
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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy) return;
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
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final scale = responsiveScale(context);
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          const PremiumBackground(),
          SafeArea(
            child: CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    18 * scale,
                    12 * scale,
                    18 * scale,
                    18 + bottomInset,
                  ),
                  sliver: SliverList.list(
                    children: [
                      const LoginHeroCard(),
                      LoginFormCard(
                        email: _email,
                        password: _password,
                        busy: _busy,
                        error: _error,
                        onSubmit: _login,
                      ),
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

class LoginHeroCard extends StatelessWidget {
  const LoginHeroCard({super.key});

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 370;
    final scale = responsiveScale(context);
    return Padding(
      padding: EdgeInsets.only(bottom: 14 * scale),
      child: Hero(
        tag: 'login-command-panel',
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: double.infinity,
            padding: EdgeInsets.all(compact ? 16 : 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(32),
              color: kInk,
              boxShadow: [
                BoxShadow(
                  color: kInk.withValues(alpha: .16),
                  blurRadius: 28,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Center(child: AppBrandMark(size: 46)),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: kSecondary.withValues(alpha: .14),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: kSecondary.withValues(alpha: .28),
                        ),
                      ),
                      child: const Text(
                        'CEO ONLY',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 18 * scale),
                Text(
                  'CEO Control Room',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: compact ? 24 : 28,
                    height: 1.02,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                  ),
                ),
                SizedBox(height: 8 * scale),
                Text(
                  'Approve appeals, review town cash, and open daily report receipts without touching operational records.',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: .78),
                    fontWeight: FontWeight.w700,
                    height: 1.28,
                  ),
                ),
                SizedBox(height: 14 * scale),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: const [
                    LoginTrustChip('Appeals'),
                    LoginTrustChip('Reports'),
                    LoginTrustChip('Balances'),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class LoginTrustChip extends StatelessWidget {
  const LoginTrustChip(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class LoginFormCard extends StatelessWidget {
  const LoginFormCard({
    super.key,
    required this.email,
    required this.password,
    required this.busy,
    required this.error,
    required this.onSubmit,
  });

  final TextEditingController email;
  final TextEditingController password;
  final bool busy;
  final String? error;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: EdgeInsets.all(16 * responsiveScale(context)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Secure sign in',
            style: TextStyle(
              color: kText,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
          const Text(
            'Only active CEO accounts can open this dashboard.',
            style: TextStyle(color: kMuted, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'CEO email',
              prefixIcon: Icon(Icons.alternate_email_rounded),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: password,
            obscureText: true,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) {
              if (!busy) onSubmit();
            },
            decoration: const InputDecoration(
              labelText: 'Password',
              prefixIcon: Icon(Icons.lock_outline_rounded),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFEFF0),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFFFCDD2)),
              ),
              child: Text(
                error!,
                style: const TextStyle(
                  color: Color(0xFFB91C1C),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: busy ? null : onSubmit,
            icon: busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.arrow_forward_rounded),
            label: Text(busy ? 'Checking CEO access...' : 'Enter CEO App'),
          ),
        ],
      ),
    );
  }
}

class ReportsShortcutCard extends StatelessWidget {
  const ReportsShortcutCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassCard(
        onTap: () => Navigator.of(context).push(
          premiumRoute(
            const DetailScaffold(
              title: 'Reports',
              child: DailyLedgerReceiptPage(),
            ),
          ),
        ),
        child: Row(
          children: [
            const GradientIconBox(
              icon: Icons.summarize_rounded,
              colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Reports',
                    style: TextStyle(
                      color: kText,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '8 PM daily ledger receipts, all towns and town-wise PDFs.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: kMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: kMuted),
          ],
        ),
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
        );
  }
}

class AnimatedMoneyText extends StatelessWidget {
  const AnimatedMoneyText(this.value, {super.key, this.style});
  final num value;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    if (prefersLeanMotion(context)) {
      return Text(
        money.format(value),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
    }
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.toDouble()),
      duration: motionDuration(context, 260),
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

class CeoShell extends StatefulWidget {
  const CeoShell({super.key});

  @override
  State<CeoShell> createState() => _CeoShellState();
}

class _CeoShellState extends State<CeoShell> with WidgetsBindingObserver {
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
  RealtimeSubscriptionManager? _realtimeManager;
  StreamSubscription<RemoteMessage>? _foregroundPushSub;
  StreamSubscription<RemoteMessage>? _openedPushSub;
  Timer? _presenceHeartbeatTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    selectedTabNotifier.addListener(_applySelectedTab);
    _tab = selectedTabNotifier.value;
    unawaited(_startPushServices());
    _subscribeToLiveAlerts();
    _startPresenceHeartbeat();
  }

  Future<void> _startPushServices() async {
    try {
      await ensureFirebaseReady().timeout(const Duration(seconds: 5));
      if (!mounted) return;
      _listenForFcmMessages();
      await _routeInitialPushMessage();
      await _verifyCeoAndEnablePush();
    } catch (_) {
      if (mounted) {
        setState(() => _pushStatus = 'Push will retry after re-login.');
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _writePresence('online', contextLabel: 'ceo_mobile_app');
      return;
    }
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _writePresence('away', contextLabel: 'ceo_mobile_app_background');
      return;
    }
    if (state == AppLifecycleState.detached) {
      _writePresence('offline', contextLabel: 'ceo_mobile_app_closed');
    }
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
    _realtimeManager = RealtimeSubscriptionManager(
      supabase: supabase,
      onRefresh: () {
        _badgeCountCache.clear();
        _townPulsesCache.clear();
        _presenceCache.clear();
        liveRefreshNotifier.value++;
      },
      onStatus: (status, error) {
        if (!mounted) return;
        setState(() {
          _realtimeStatus =
              error == null ? 'Realtime: $status' : 'Realtime error: $error';
        });
      },
    )..start();
  }

  void _startPresenceHeartbeat() {
    _writePresence('online', contextLabel: 'ceo_mobile_app');
    _presenceHeartbeatTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _writePresence('online', contextLabel: 'ceo_mobile_app'),
    );
  }

  Future<void> _writePresence(String status, {String contextLabel = 'ceo_mobile_app'}) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    try {
      await supabase.from('users').update({
        'online_status': status,
        'last_seen_at': DateTime.now().toUtc().toIso8601String(),
        'device_label': 'CEO Android',
        'last_active_context': contextLabel,
      }).eq('id', userId);
    } catch (_) {
      // Presence columns are added by src/sql/user-presence.sql.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    selectedTabNotifier.removeListener(_applySelectedTab);
    _presenceHeartbeatTimer?.cancel();
    _writePresence('offline', contextLabel: 'ceo_mobile_app_closed');
    _foregroundPushSub?.cancel();
    _openedPushSub?.cancel();
    _realtimeManager?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lean = prefersLeanMotion(context);
    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          const PremiumBackground(),
          SafeArea(
            bottom: false,
            child: AnimatedSwitcher(
              duration: motionDuration(context, 220),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) {
                if (lean) return child;
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
        padding: const EdgeInsets.only(bottom: 76),
        child: PressableScale(
          onTap: () {
            setState(() {
              _fabTurns += .5;
              _tab = _tab == 2 ? 0 : 2;
            });
          },
            child: AnimatedRotation(
              turns: _fabTurns,
              duration: motionDuration(context, 240, leanMs: 0),
              curve: Curves.easeOutBack,
              child: Container(
              width: 52,
              height: 52,
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
                    blurRadius: 18,
                    offset: const Offset(0, 8),
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
    final lean = prefersLeanMotion(context);
    final showLabel = width >= 390;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
        child: Container(
          height: 62,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .96),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: Colors.white),
            boxShadow: [
              BoxShadow(
                color: kInk.withValues(alpha: lean ? 0 : .10),
                blurRadius: lean ? 0 : 22,
                offset: const Offset(0, 10),
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
                          duration: motionDuration(context, 170, leanMs: 0),
                          curve: Curves.easeOutCubic,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            color: currentIndex == i
                                ? const Color(0xFFEFF8FF)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(19),
                            border: currentIndex == i
                                ? Border.all(color: const Color(0xFFB2DDFF))
                                : null,
                          ),
                          child: Center(
                            child: TweenAnimationBuilder<double>(
                              tween: Tween(
                                begin: 1,
                                end: !lean && currentIndex == i ? 1.10 : 1,
                              ),
                              duration: motionDuration(context, 280, leanMs: 50),
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
                                    size: 21,
                                  ),
                                  AnimatedSize(
                                    duration: motionDuration(context, 150, leanMs: 0),
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
    );
  }
}

PageRouteBuilder<void> premiumRoute(Widget page) {
  return PageRouteBuilder<void>(
    transitionDuration: const Duration(milliseconds: 220),
    reverseTransitionDuration: const Duration(milliseconds: 160),
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, animation, __, child) {
      final offset = Tween<Offset>(
        begin: const Offset(.035, 0),
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
    this.padding,
    this.appBarTitle = 'Overview',
    this.showAppBar = true,
    this.showNotificationAction = true,
  });
  final List<Widget> children;
  final EdgeInsetsGeometry? padding;
  final String appBarTitle;
  final bool showAppBar;
  final bool showNotificationAction;

  @override
  Widget build(BuildContext context) {
    final lean = prefersLeanMotion(context);
    return CustomScrollView(
      cacheExtent: lean ? 420 : 900,
      physics: lean
          ? const ClampingScrollPhysics()
          : const AlwaysScrollableScrollPhysics(
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
                            onPressed: () {
                              Navigator.of(context).push(
                                premiumRoute(
                                  const DetailScaffold(
                                    title: 'Notifications',
                                    child: NotificationsPage(),
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(
                              Icons.notifications_rounded,
                              color: kText,
                            ),
                          ),
                          Positioned(
                            right: 10,
                            top: 10,
                            child: ValueListenableBuilder<int>(
                              valueListenable: liveRefreshNotifier,
                              builder: (context, _, __) {
                                return FutureBuilder<int>(
                                  future: loadNotificationBadgeCount(),
                                  builder: (context, snap) {
                                    final count = snap.data ?? 0;
                                    if (count <= 0) return const SizedBox.shrink();
                                    return Container(
                                      constraints: const BoxConstraints(
                                        minWidth: 18,
                                        minHeight: 18,
                                      ),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 5,
                                      ),
                                      decoration: const BoxDecoration(
                                        color: Color(0xFFEF4444),
                                        shape: BoxShape.circle,
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        count > 99 ? '99+' : '$count',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 9,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ]
                : null,
          ),
        SliverPadding(
          padding: padding ?? responsivePagePadding(context),
          sliver: SliverList(delegate: SliverChildListDelegate.fixed(children)),
        ),
      ],
    );
  }
}

Future<List<Map<String, dynamic>>> safeSelectRows(
  Future<dynamic> Function() loader,
) async {
  try {
    final data = await loader().timeout(const Duration(seconds: 4));
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return const <Map<String, dynamic>>[];
  }
}

Future<List<Map<String, dynamic>>> resilientSelectRows(
  Future<dynamic> Function() primary,
  Future<dynamic> Function() fallback,
) async {
  try {
    final data = await primary().timeout(const Duration(seconds: 4));
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return safeSelectRows(fallback);
  }
}

Future<int> loadNotificationBadgeCount({bool force = false}) {
  return _badgeCountCache.get(_loadNotificationBadgeCountUncached, force: force);
}

Future<int> _loadNotificationBadgeCountUncached() async {
  return loadCeoInboxBadgeCount(supabase);
}

Future<List<CeoInboxItem>> loadCeoInboxItems() async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final inboxRows = await loadCeoInboxRows(supabase, limit: 60);

  final items = <CeoInboxItem>[];
  for (final row in inboxRows.appeals) {
    final user = row['requested_by_user_id'];
    final userMap = user is Map ? Map<String, dynamic>.from(user) : null;
    final town = appealTownName(row).isNotEmpty
        ? appealTownName(row)
        : '${userMap?['town_name'] ?? 'No town'}';
    final created = parseAnyDate(row['created_at']) ?? DateTime.now();
    items.add(
      CeoInboxItem(
        id: 'appeal-${row['id']}',
        title: 'Pending appeal',
        subtitle: '${pretty(row['appeal_type'])} - $town',
        meta: formatDate(created),
        body: 'Requested by ${userMap?['full_name'] ?? userMap?['email'] ?? 'Accountant'}',
        route: 'appeals',
        createdAt: created,
        icon: const VectorBadge(kind: BadgeKind.pending, size: 24),
      ),
    );
  }

  for (final row in inboxRows.dailyEntries) {
    final created = parseAnyDate(row['created_at'] ?? rowVal(row, 'Date')) ??
        DateTime.now();
    final amount = asNum(rowVal(row, 'Amount'));
    items.add(
      CeoInboxItem(
        id: 'entry-${dailyEntryStableKey(row)}',
        title: 'Daily entry review',
        subtitle:
            '${rowVal(row, 'Town_Name') ?? 'No town'} - ${pretty(rowVal(row, 'Type'))}',
        meta: '${formatDate(rowVal(row, 'Date') ?? created)} - ${money.format(amount)}',
        body: '${rowVal(row, 'Description') ?? rowVal(row, 'Category') ?? 'Entry pending CEO review'}',
        route: 'entries',
        createdAt: created,
        icon: const VectorBadge(kind: BadgeKind.entry, size: 24),
      ),
    );
  }

  for (final row in inboxRows.notifications) {
    final created = parseAnyDate(
          rowVal(row, 'Created_Date') ?? row['created_at'],
        ) ??
        DateTime.now();
    items.add(
      CeoInboxItem(
        id: 'notification-${row['id'] ?? rowVal(row, 'Notification_ID') ?? created.millisecondsSinceEpoch}',
        title: '${rowVal(row, 'Type') ?? 'Business notification'}',
        subtitle:
            '${rowVal(row, 'Town_Name') ?? ''} ${rowVal(row, 'Plot_Shop_Number') ?? ''}'.trim(),
        meta: formatDate(created),
        body: '${rowVal(row, 'Message') ?? 'Open for details'}',
        route: 'notifications',
        createdAt: created,
      ),
    );
  }

  for (final row in inboxRows.ledgerReceipts) {
    final created = parseAnyDate(row['created_at'] ?? row['report_date']) ??
        DateTime.now();
    items.add(
      CeoInboxItem(
        id: 'daily-ledger-${row['id'] ?? row['town_name'] ?? created.millisecondsSinceEpoch}',
        title: 'Daily ledger receipt ready',
        subtitle: '${row['town_name'] ?? rowVal(row, 'Town_Name') ?? 'Town receipt'}',
        meta: '${row['report_date'] ?? today}',
        body: 'Today income and expense receipt is ready for CEO review.',
        route: 'daily_report',
        createdAt: created,
        icon: const VectorBadge(kind: BadgeKind.money, size: 24),
      ),
    );
  }

  items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return items;
}

Future<List<TownPulse>> loadTownPulses({bool force = false}) {
  return _townPulsesCache.get(() => loadTownPulseRows(supabase), force: force);
}

Future<List<OperatorPresence>> loadOperatorPresence({bool force = false}) {
  return _presenceCache.get(
    () => loadOperatorPresenceRows(supabase),
    force: force,
  );
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
    liveRefreshNotifier.addListener(_handleLiveRefresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_handleLiveRefresh);
    super.dispose();
  }

  void _handleLiveRefresh() {
    if (!mounted) return;
    setState(() => _future = _load(force: true));
  }

  Future<Map<String, dynamic>> _load({bool force = false}) async {
    final results = await Future.wait<dynamic>([
      loadTownPulses(force: force),
      loadOperatorPresence(force: force),
    ]);
    final towns = results[0] as List<TownPulse>;
    final operators = results[1] as List<OperatorPresence>;
    return {
      'towns': towns,
      'operators': operators,
      'appeals': towns.fold<num>(0, (sum, t) => sum + t.pendingAppeals),
      'received': towns.fold<num>(0, (sum, t) => sum + t.totalReceived),
      'expenses': towns.fold<num>(0, (sum, t) => sum + t.totalExpenses),
      'cash': towns.fold<num>(0, (sum, t) => sum + t.cashBalance),
      'pending': towns.fold<num>(0, (sum, t) => sum + t.pendingCollection),
      'sales': towns.fold<int>(0, (sum, t) => sum + t.salesCount),
    };
  }

  Future<void> _refresh() async {
    final next = _load(force: true);
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
          final operators =
              (d?['operators'] as List<OperatorPresence>?) ??
              const <OperatorPresence>[];
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
              ExecutiveSummaryCard(
                received: received,
                cash: asNum(d?['cash']),
                pending: pending,
                onlineCount: operators.where((op) => op.isOnline).length,
                totalOperators: operators.length,
              ),
              StatusStrip(
                items: [
                  widget.pushStatus,
                  widget.realtimeStatus,
                ].where((e) => e.trim().isNotEmpty).toList(),
              ),
              const ReportsShortcutCard(),
              OnlinePresencePreview(operators: operators),
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

class ExecutiveSummaryCard extends StatelessWidget {
  const ExecutiveSummaryCard({
    super.key,
    required this.received,
    required this.cash,
    required this.pending,
    required this.onlineCount,
    required this.totalOperators,
  });

  final num received;
  final num cash;
  final num pending;
  final int onlineCount;
  final int totalOperators;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 370;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Hero(
        tag: 'executive-summary-card',
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: double.infinity,
            padding: EdgeInsets.all(compact ? 18 : 22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(30),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF101C3D),
                  Color(0xFF2563EB),
                  Color(0xFF00A889),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF2563EB).withValues(alpha: .24),
                  blurRadius: 36,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .18),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: .22),
                        ),
                      ),
                      child: const Icon(
                        Icons.account_balance_wallet_rounded,
                        color: Colors.white,
                      ),
                    ),
                    const Spacer(),
                    PresencePill(
                      label: '$onlineCount/$totalOperators online',
                      active: onlineCount > 0,
                      bright: true,
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  'Portfolio cash balance',
                  style: TextStyle(
                    color: Color(0xDDFFFFFF),
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    money.format(cash),
                    maxLines: 1,
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: compact ? 30 : 36,
                      fontWeight: FontWeight.w900,
                      height: 1,
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: _ExecutiveMiniStat(
                        label: 'Received',
                        value: money.format(received),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ExecutiveMiniStat(
                        label: 'Receivable',
                        value: money.format(pending),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      )
          .animate()
          .fadeIn(duration: 420.ms)
          .slideY(begin: .10, curve: Curves.easeOutCubic),
    );
  }
}

class _ExecutiveMiniStat extends StatelessWidget {
  const _ExecutiveMiniStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .15),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: .18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xCCFFFFFF),
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class OnlinePresencePreview extends StatelessWidget {
  const OnlinePresencePreview({super.key, required this.operators});
  final List<OperatorPresence> operators;

  @override
  Widget build(BuildContext context) {
    final online = operators.where((op) => op.isOnline).toList();
    final preview = operators.take(5).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: GlassCard(
        padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
        onTap: () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Online teams',
                child: OnlinePresencePage(),
              ),
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const GradientIconBox(
                  icon: Icons.groups_2_rounded,
                  colors: [Color(0xFF2563EB), Color(0xFF00A889)],
                  size: 42,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Live town teams',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: kText,
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        '${online.length} online now. Tap to see last seen by town.',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: kMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: kMuted),
              ],
            ),
            if (preview.isNotEmpty) ...[
              const SizedBox(height: 14),
              SizedBox(
                height: 42,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: preview.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) => PresenceAvatar(
                    operator: preview[index],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class PresenceAvatar extends StatelessWidget {
  const PresenceAvatar({super.key, required this.operator});
  final OperatorPresence operator;

  @override
  Widget build(BuildContext context) {
    final initial = operator.name.trim().isEmpty
        ? '?'
        : operator.name.trim().substring(0, 1).toUpperCase();
    return Tooltip(
      message: '${operator.name} - ${operator.townName} - ${relativeTime(operator.lastSeenAt)}',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: operator.isOnline
                    ? const [Color(0xFF00C9A7), Color(0xFF2563EB)]
                    : const [Color(0xFFCBD5E1), Color(0xFF94A3B8)],
              ),
              boxShadow: [
                BoxShadow(
                  color: (operator.isOnline ? kSecondary : kMuted)
                      .withValues(alpha: .16),
                  blurRadius: 14,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Positioned(
            right: -1,
            bottom: 0,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: operator.isOnline
                    ? const Color(0xFF22C55E)
                    : const Color(0xFF94A3B8),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PresencePill extends StatelessWidget {
  const PresencePill({
    super.key,
    required this.label,
    required this.active,
    this.bright = false,
  });
  final String label;
  final bool active;
  final bool bright;

  @override
  Widget build(BuildContext context) {
    final color = active ? const Color(0xFF22C55E) : const Color(0xFF94A3B8);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: bright
            ? Colors.white.withValues(alpha: .14)
            : color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: bright
              ? Colors.white.withValues(alpha: .18)
              : color.withValues(alpha: .22),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 7),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: bright ? Colors.white : color,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class OnlinePresencePage extends StatefulWidget {
  const OnlinePresencePage({super.key});

  @override
  State<OnlinePresencePage> createState() => _OnlinePresencePageState();
}

class _OnlinePresencePageState extends State<OnlinePresencePage> {
  late Future<List<OperatorPresence>> _future;

  @override
  void initState() {
    super.initState();
    _future = loadOperatorPresence();
    liveRefreshNotifier.addListener(_refresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() => _future = loadOperatorPresence(force: true));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<OperatorPresence>>(
      future: _future,
      builder: (context, snap) {
        final operators = snap.data ?? const <OperatorPresence>[];
        final grouped = <String, List<OperatorPresence>>{};
        for (final op in operators) {
          grouped.putIfAbsent(op.townName, () => []).add(op);
        }
        return PremiumScrollView(
          appBarTitle: 'Online teams',
          children: [
            const HeaderBlock(
              title: 'Who is online?',
              subtitle:
                  'Realtime presence for CEO, town accountants and last activity.',
            ),
            if (!snap.hasData && !snap.hasError) const SkeletonList(),
            if (snap.hasError) ErrorBlock(error: friendlyDbError(snap.error!)),
            if (snap.hasData && operators.isEmpty)
              const EmptyBlock(
                text:
                    'No team presence yet. Run src/sql/user-presence.sql and open desktop app once.',
              ),
            for (final entry in grouped.entries) ...[
              SectionLabel(entry.key),
              for (var i = 0; i < entry.value.length; i++)
                AnimatedEntry(
                  index: i,
                  child: OperatorPresenceCard(operator: entry.value[i]),
                ),
            ],
          ],
        );
      },
    );
  }
}

class OperatorPresenceCard extends StatelessWidget {
  const OperatorPresenceCard({super.key, required this.operator});
  final OperatorPresence operator;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            PresenceAvatar(operator: operator),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    operator.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: kText,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${pretty(operator.role)} - ${operator.deviceLabel.isEmpty ? 'Desktop/mobile app' : operator.deviceLabel}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: kMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            PresencePill(
              label: operator.isOnline
                  ? 'Online'
                  : relativeTime(operator.lastSeenAt),
              active: operator.isOnline,
            ),
          ],
        ),
      ),
    );
  }
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
    final next = loadTownPulses(force: true);
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
    final data = mapFromAny(row['requested_data']);
    final user = mapFromAny(row['requested_by_user_id']);
    final amount = data['amount'] ?? data['Amount'] ?? row['amount'];
    final date = data['date'] ?? data['Date'] ?? row['created_at'];
    return InfoCard(
      animate: false,
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

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ActivityRows>(
      future: loadActivityRows(supabase),
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
          for (final s in snap.data?.sales ?? const <Map<String, dynamic>>[])
            InfoCard(
              title:
                  'Sale - ${money.format(asNum(rowVal(s, 'Total_Amount_PKR')))}',
              subtitle:
                  '${rowVal(s, 'Town_Name') ?? 'Town'} - ${rowVal(s, 'Type') ?? ''} ${rowVal(s, 'Plot_Shop_Number') ?? ''}',
              meta:
                  '${formatDate(rowVal(s, 'Sell_Date'))} - ${rowVal(s, 'Status') ?? 'Sold'}',
              body: 'Agent: ${rowVal(s, 'Agent_Name') ?? '-'}',
            ),
          for (final e in snap.data?.entries ?? const <Map<String, dynamic>>[])
            InfoCard(
              title:
                  '${rowVal(e, 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(e, 'Amount')))}',
              subtitle:
                  '${rowVal(e, 'Town_Name') ?? 'Town'} - ${rowVal(e, 'Category') ?? 'General'}',
              meta: formatDate(rowVal(e, 'Date')),
              body: '${rowVal(e, 'Description') ?? ''}',
            ),
          for (final e in snap.data?.expenses ?? const <Map<String, dynamic>>[])
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
              (snap.data!.sales.isEmpty &&
                  snap.data!.entries.isEmpty &&
                  snap.data!.expenses.isEmpty))
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
  bool _loading = false;
  String _filter = 'pending';
  List<Map<String, dynamic>>? _items;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _items = cachedApprovalReviewRows(
      filter: _filter,
      limit: reviewListLimit,
    );
    unawaited(_hydrateFromDisk(_filter));
    unawaited(_refreshFromCloud(showLoading: _items?.isEmpty ?? true));
    liveRefreshNotifier.addListener(_handleLiveRefresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_handleLiveRefresh);
    super.dispose();
  }

  void _handleLiveRefresh() {
    if (!mounted || _reviewing) return;
    unawaited(_refreshFromCloud(showLoading: false));
  }

  Future<List<Map<String, dynamic>>> _load([String? filter]) async {
    return loadApprovalReviewRows(
      supabase,
      filter: filter ?? _filter,
      limit: reviewListLimit,
    );
  }

  Future<void> _hydrateFromDisk(String filter) async {
    final rows = await loadCachedApprovalReviewRowsFromDisk(
      filter: filter,
      limit: reviewListLimit,
    );
    if (!mounted || rows.isEmpty || filter != _filter || (_items?.isNotEmpty ?? false)) {
      return;
    }
    setState(() {
      _items = rows;
      _loading = false;
      _error = null;
    });
  }

  Future<void> _refreshFromCloud({
    String? filter,
    bool showLoading = true,
  }) async {
    final activeFilter = filter ?? _filter;
    try {
      if (mounted && showLoading) {
        setState(() {
          _loading = true;
          _error = null;
        });
      }
      final rows = await _load(activeFilter);
      if (mounted) {
        if (activeFilter != _filter) return;
        setState(() {
          _items = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyDbError(e));
    } finally {
      if (mounted && activeFilter == _filter) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() => _refreshFromCloud(showLoading: true);

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
      clearApprovalReviewCache();
      _badgeCountCache.clear();
      _townPulsesCache.clear();
      liveRefreshNotifier.value++;
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

  Future<void> _reviewRow(Map<String, dynamic> row, String status) async {
    if (isDailyReviewItem(row)) {
      await _reviewDailyEntryRow(row, status);
      return;
    }
    await _review('${row['id']}', status);
  }

  Future<void> _reviewDailyEntryRow(Map<String, dynamic> row, String status) async {
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
      _badgeCountCache.clear();
      _townPulsesCache.clear();
      liveRefreshNotifier.value++;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Entry $status: ${result?['message'] ?? 'done'}'),
          ),
        );
        setState(
          () => _items = (_items ?? [])
              .where((item) =>
                  !(isDailyReviewItem(item) &&
                      dailyEntryStableKey(item) == dailyEntryStableKey(row)))
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
    final rows = _items ?? const <Map<String, dynamic>>[];
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
                  final cached = cachedApprovalReviewRows(
                    filter: next,
                    limit: reviewListLimit,
                  );
                  setState(() {
                    _filter = next;
                    _items = cached;
                    _error = null;
                    _loading = cached.isEmpty;
                  });
                  unawaited(_hydrateFromDisk(next));
                  unawaited(
                    _refreshFromCloud(
                      filter: next,
                      showLoading: cached.isEmpty,
                    ),
                  );
                },
              ),
              if (_error != null)
                ErrorBlock(error: 'Schema/API issue: $_error'),
              if (_loading)
                const LoadingStateBlock(
                  text: 'Loading approval inbox from secure cloud...',
                ),
              ReviewRowsList(
                rows: rows,
                itemBuilder: (context, row, index) => AppealInfoCard(
                  row: row,
                  actions: [
                    if (_filter == 'pending') ...[
                      OutlinedButton.icon(
                        onPressed: _reviewing
                            ? null
                            : () => _reviewRow(row, 'rejected'),
                        icon: const Icon(Icons.close),
                        label: const Text('Reject'),
                      ),
                      FilledButton.icon(
                        onPressed: _reviewing
                            ? null
                            : () => _reviewRow(row, 'approved'),
                        icon: const Icon(Icons.check),
                        label: const Text('Approve'),
                      ),
                    ],
                  ],
                ),
              ),
              if (!_loading && rows.isEmpty && _error == null)
                EmptyBlock(text: 'No $_filter appeals.'),
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
  bool _reviewing = false;
  bool _loading = false;
  String _filter = 'pending';
  List<Map<String, dynamic>>? _items;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _items = cachedApprovalReviewRows(
      filter: _filter,
      limit: reviewListLimit,
    ).where(isDailyReviewItem).toList();
    unawaited(_hydrateFromDisk(_filter));
    unawaited(_refreshFromCloud(showLoading: _items?.isEmpty ?? true));
    liveRefreshNotifier.addListener(_handleLiveRefresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_handleLiveRefresh);
    super.dispose();
  }

  void _handleLiveRefresh() {
    if (!mounted || _reviewing) return;
    unawaited(_refreshFromCloud(showLoading: false));
  }

  Future<List<Map<String, dynamic>>> _load([String? filter]) async {
    final activeFilter = filter ?? _filter;
    final rows = (await loadApprovalReviewRows(
      supabase,
      filter: activeFilter,
      limit: reviewListLimit,
    ))
        .where(isDailyReviewItem)
        .toList();
    rows.sort((a, b) {
      final bDate = '${rowVal(b, 'Date') ?? rowVal(b, 'created_at') ?? ''}';
      final aDate = '${rowVal(a, 'Date') ?? rowVal(a, 'created_at') ?? ''}';
      return bDate.compareTo(aDate);
    });
    return rows;
  }

  Future<void> _hydrateFromDisk(String filter) async {
    final rows = (await loadCachedApprovalReviewRowsFromDisk(
      filter: filter,
      limit: reviewListLimit,
    ))
        .where(isDailyReviewItem)
        .toList();
    if (!mounted || rows.isEmpty || filter != _filter || (_items?.isNotEmpty ?? false)) {
      return;
    }
    setState(() {
      _items = rows;
      _loading = false;
      _error = null;
    });
  }

  Future<void> _refreshFromCloud({
    String? filter,
    bool showLoading = true,
  }) async {
    final activeFilter = filter ?? _filter;
    try {
      if (mounted && showLoading) {
        setState(() {
          _loading = true;
          _error = null;
        });
      }
      final rows = await _load(activeFilter);
      if (mounted) {
        if (activeFilter != _filter) return;
        setState(() {
          _items = rows;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyDbError(e));
    } finally {
      if (mounted && activeFilter == _filter) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() => _refreshFromCloud(showLoading: true);

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
      clearApprovalReviewCache();
      _badgeCountCache.clear();
      _townPulsesCache.clear();
      liveRefreshNotifier.value++;
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
    final rows = _items ?? const <Map<String, dynamic>>[];
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
                  final cached = cachedApprovalReviewRows(
                    filter: next,
                    limit: reviewListLimit,
                  ).where(isDailyReviewItem).toList();
                  setState(() {
                    _filter = next;
                    _items = cached;
                    _error = null;
                    _loading = cached.isEmpty;
                  });
                  unawaited(_hydrateFromDisk(next));
                  unawaited(
                    _refreshFromCloud(
                      filter: next,
                      showLoading: cached.isEmpty,
                    ),
                  );
                },
              ),
              if (_error != null)
                ErrorBlock(error: 'Schema/API issue: $_error'),
              if (_loading)
                const LoadingStateBlock(
                  text: 'Loading daily entry reviews from secure cloud...',
                ),
              ReviewRowsList(
                rows: rows,
                itemBuilder: (context, row, index) => InfoCard(
                  icon: badgeForStatus(reviewStatusOf(row)),
                  status: reviewStatusOf(row),
                  title:
                      '${rowVal(row, 'Type') ?? 'Entry'} - ${money.format(asNum(rowVal(row, 'Amount')))}',
                  subtitle:
                      '${rowVal(row, 'Town_Name') ?? 'No town'} - ${rowVal(row, 'Category') ?? 'General'}',
                  meta:
                      '${formatDate(rowVal(row, 'Date'))} - ${reviewStatusOf(row)}',
                  body: '${rowVal(row, 'Description') ?? ''}',
                  actions: [
                    if (_filter == 'pending') ...[
                      OutlinedButton.icon(
                        onPressed: _reviewing
                            ? null
                            : () => _mark(row, 'rejected'),
                        icon: const Icon(Icons.report),
                        label: const Text('Reject'),
                      ),
                      FilledButton.icon(
                        onPressed: _reviewing
                            ? null
                            : () => _mark(row, 'approved'),
                        icon: const Icon(Icons.verified),
                        label: const Text('Approve'),
                      ),
                    ],
                  ],
                ),
              ),
              if (!_loading && rows.isEmpty && _error == null)
                EmptyBlock(text: 'No $_filter daily entries.'),
            ],
          ),
    );
  }
}

class ReviewRowsList extends StatelessWidget {
  const ReviewRowsList({
    super.key,
    required this.rows,
    required this.itemBuilder,
  });

  final List<Map<String, dynamic>> rows;
  final Widget Function(
    BuildContext context,
    Map<String, dynamic> row,
    int index,
  ) itemBuilder;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      children: List<Widget>.generate(rows.length, (index) {
        final child = itemBuilder(context, rows[index], index);
        if (index >= 12) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: child,
          );
        }
        return AnimatedEntry(index: index, child: child);
      }),
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

  Future<List<Map<String, dynamic>>> _loadSavedReceiptMediaRows() async {
    return loadReceiptMediaRows(supabase, date: _date);
  }

  Future<List<LedgerReceipt>> _loadReceipts() async {
    final bundle = await loadReceiptBundle(
      supabase,
      date: _date,
      initialTown: widget.initialTown,
    );
    final data = bundle.entryRows;
    final mediaRows = bundle.mediaRows;
    final activeTownNames = bundle.townRows
        .map((town) => '${rowVal(town, 'Town_Name')}'.trim())
        .where((town) => town.isNotEmpty && town != 'null')
        .toSet();
    final day = DateFormat('yyyy-MM-dd').format(_date);
    final rows = List<Map<String, dynamic>>.from(
      data,
    ).where((row) {
      final status = reviewStatusOf(row);
      final town = '${rowVal(row, 'Town_Name')}'.trim();
      return '${rowVal(row, 'Date')}'.startsWith(day) &&
          status != 'pending' &&
          status != 'rejected' &&
          (activeTownNames.isEmpty || activeTownNames.contains(town));
    }).toList();
    final townSet = rows
        .map((row) => '${rowVal(row, 'Town_Name')}'.trim())
        .where((name) => name.isNotEmpty && name != 'null')
        .toSet();
    for (final media in mediaRows) {
      final town = '${media['town_name'] ?? media['Town_Name'] ?? ''}'.trim();
      if (town.isNotEmpty && town != 'null' && town.toLowerCase() != 'all towns') {
        townSet.add(town);
      }
    }
    final townNames = townSet.toList()..sort();
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
              FutureBuilder<List<Map<String, dynamic>>>(
                future: _loadSavedReceiptMediaRows(),
                builder: (context, mediaSnap) {
                  final mediaRows = mediaSnap.data ?? const <Map<String, dynamic>>[];
                  if (mediaRows.isEmpty) return const SizedBox.shrink();
                  final townRows = mediaRows
                      .where((row) => '${row['town_name'] ?? rowVal(row, 'Town_Name') ?? ''}'.trim().toLowerCase() != 'all towns')
                      .length;
                  final summary = mediaRows.firstWhere(
                    (row) => '${row['town_name'] ?? rowVal(row, 'Town_Name') ?? ''}'.trim().toLowerCase() == 'all towns',
                    orElse: () => mediaRows.first,
                  );
                  return InfoCard(
                    icon: const VectorBadge(kind: BadgeKind.money, size: 24),
                    title: 'Saved receipt package',
                    subtitle: '$townRows town receipt file(s) archived for this date.',
                    meta: '${summary['report_date'] ?? rowVal(summary, 'Report_Date') ?? DateFormat('yyyy-MM-dd').format(_date)}',
                    body: '${summary['title'] ?? rowVal(summary, 'Title') ?? 'Daily ledger receipts are ready.'}',
                  );
                },
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

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: liveRefreshNotifier,
      builder: (context, _, __) {
        return FutureBuilder<List<CeoInboxItem>>(
          future: loadCeoInboxItems(),
          builder: (context, snap) => RefreshIndicator(
            onRefresh: () async => liveRefreshNotifier.value++,
            child: PremiumScrollView(
              showAppBar: false,
              children: [
                const HeaderBlock(
                  title: 'Notifications',
                  subtitle:
                      'Real CEO inbox for pending approvals, daily ledger receipts, and business alerts.',
                ),
                if (!snap.hasData && !snap.hasError) const SkeletonList(),
                if (snap.hasError)
                  ErrorBlock(error: friendlyDbError(snap.error!)),
                for (final item in snap.data ?? const <CeoInboxItem>[])
                  InfoCard(
                    icon: item.icon,
                    title: item.title,
                    subtitle: item.subtitle,
                    meta: item.meta,
                    body: item.body,
                    actions: [
                      OutlinedButton.icon(
                        onPressed: () => routeFromPushData({'route': item.route}),
                        icon: const Icon(Icons.open_in_new_rounded),
                        label: const Text('Open'),
                      ),
                    ],
                  ),
                if (snap.hasData && snap.data!.isEmpty)
                  const EmptyBlock(text: 'No active notifications.'),
              ],
            ),
          ),
        );
      },
    );
  }
}

class TownsPage extends StatelessWidget {
  const TownsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: loadActiveTownRows(supabase),
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
        'Online teams',
        'See who is online and last seen across all towns.',
        const VectorBadge(kind: BadgeKind.town),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Online teams',
                child: OnlinePresencePage(),
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
        'Reports',
        '8 PM daily ledger reports, grouped and town-wise receipts.',
        const VectorBadge(kind: BadgeKind.money),
        () {
          Navigator.of(context).push(
            premiumRoute(
              const DetailScaffold(
                title: 'Reports',
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
  const HeaderBlock({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon = Icons.auto_graph_rounded,
  });
  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 370;
    final lean = prefersLeanMotion(context);
    final scale = responsiveScale(context);
    final block = Material(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.only(bottom: 14 * scale),
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.all(compact ? 15 : 18),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .92),
            borderRadius: BorderRadius.circular(compact ? 24 : 30),
            border: Border.all(color: Colors.white.withValues(alpha: .86)),
            boxShadow: lean
                ? const []
                : [
                    BoxShadow(
                      color: const Color(0xFF101828).withValues(alpha: .08),
                      blurRadius: 28,
                      offset: const Offset(0, 16),
                    ),
                  ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [kPrimary, kSky],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: Colors.white, size: 21),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF8FF),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: const Color(0xFFB2DDFF),
                      ),
                    ),
                    child: const Text(
                      'CEO',
                      style: TextStyle(
                        color: kPrimary,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 14 * scale),
              Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: compact ? 22 : 26,
                  fontWeight: FontWeight.w900,
                  height: 1.04,
                  color: kText,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: kMuted,
                  height: 1.35,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (lean) return block;
    return block
        .animate()
        .fadeIn(duration: 220.ms)
        .slideY(begin: .04, curve: Curves.easeOutCubic);
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
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 240),
        child: SingleChildScrollView(
          child: Text(
            breakLongText(error),
            softWrap: true,
            overflow: TextOverflow.visible,
            style: const TextStyle(
              color: Color(0xFF991B1B),
              fontWeight: FontWeight.w700,
              height: 1.35,
            ),
          ),
        ),
      ),
    );
  }
}

String breakLongText(String value) {
  return value
      .replaceAll('/', '/\u200B')
      .replaceAll('\\', '\\\u200B')
      .replaceAll('.', '.\u200B')
      .replaceAll('_', '_\u200B')
      .replaceAll('-', '-\u200B')
      .replaceAll(':', ':\u200B');
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
    this.animate = true,
  });
  final String title;
  final String subtitle;
  final String meta;
  final String body;
  final List<Widget> actions;
  final Widget? icon;
  final String? status;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final scale = responsiveScale(context);
    final lean = prefersLeanMotion(context);
    final card = Padding(
      padding: EdgeInsets.only(bottom: 10 * scale),
      child:
          GlassCard(
                onTap: () {},
                padding: EdgeInsets.all(12 * scale),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (icon != null) ...[
                          icon!,
                          SizedBox(width: 8 * scale),
                        ] else ...[
                          const GradientIconBox(
                            icon: Icons.layers_rounded,
                            size: 38,
                            colors: [kPrimary, Color(0xFF8A84FF)],
                          ),
                          SizedBox(width: 8 * scale),
                        ],
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w900,
                              color: kText,
                            ),
                          ),
                        ),
                        if (status != null) StatusPill(status: status!),
                      ],
                    ),
                    SizedBox(height: 7 * scale),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: kText,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      meta,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: kMuted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (body.trim().isNotEmpty) ...[
                      SizedBox(height: 9 * scale),
                      Text(
                        body,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: kMuted,
                          height: 1.35,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                    if (actions.isNotEmpty) ...[
                      SizedBox(height: 10 * scale),
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
              ),
    );
    return animate
        ? (lean
            ? RepaintBoundary(child: card)
            : card
            .animate()
            .fadeIn(duration: 180.ms)
            .slideY(begin: .025, curve: Curves.easeOutCubic))
        : card;
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

class LoadingStateBlock extends StatelessWidget {
  const LoadingStateBlock({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: kMuted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
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
      constraints: const BoxConstraints(maxWidth: 82),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
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
          fontSize: 9.5,
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
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        spacing: 7,
        runSpacing: 7,
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
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
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
    final child = Column(
      children: List.generate(
        prefersLeanMotion(context) ? 2 : 3,
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
    );
    if (prefersLeanMotion(context)) return child;
    return Shimmer.fromColors(
      baseColor: const Color(0xFFE9EDF5),
      highlightColor: Colors.white,
      child: child,
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
        unawaited(handleNotificationResponse(response));
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
    final table = '${message.data['table'] ?? ''}'.trim();
    final route = '${message.data['route'] ?? ''}'.trim();
    final event =
        '${message.data['event_type'] ?? message.data['event'] ?? ''}'.trim();
    final isPendingAppeal =
        table == 'appeals' &&
        '${message.data['status'] ?? 'pending'}'.toLowerCase() == 'pending';
    final isDailyLedger =
        route == 'daily_report' ||
        event == 'daily_ledger_report_ready' ||
        table == 'daily_ledger_receipts';
    if (!isPendingAppeal && !isDailyLedger) {
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
    final appealId = '${message.data['id'] ?? ''}'.trim();
    final payload = isPendingAppeal && appealId.isNotEmpty
        ? 'appeal_action:$appealId'
        : (route.isNotEmpty ? route : routeForTable(table));
    await show(
      title,
      body,
      payload: payload,
      withAppealActions: isPendingAppeal && appealId.isNotEmpty,
    );
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

  static Future<void> show(
    String title,
    String body, {
    String? payload,
    bool withAppealActions = false,
  }) async {
    final android = AndroidNotificationDetails(
      'ceo_live_alerts',
      'CEO Live Alerts',
      channelDescription: 'Pending appeal alerts for CEO review.',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_stat_ceo_notification',
      largeIcon: const DrawableResourceAndroidBitmap('ic_launcher'),
      actions: withAppealActions
          ? const <AndroidNotificationAction>[
              AndroidNotificationAction(
                'approve_appeal',
                'Approve',
                showsUserInterface: true,
              ),
              AndroidNotificationAction(
                'reject_appeal',
                'Reject',
                showsUserInterface: true,
                cancelNotification: true,
              ),
            ]
          : null,
    );
    final details = NotificationDetails(android: android);
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
      largeIcon: DrawableResourceAndroidBitmap('ic_launcher'),
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

class TimedMemoryCache<T> {
  TimedMemoryCache(this.ttl);
  final Duration ttl;
  T? _value;
  DateTime? _time;
  Future<T>? _inFlight;

  bool get _fresh =>
      _value != null &&
      _time != null &&
      DateTime.now().difference(_time!) < ttl;

  Future<T> get(Future<T> Function() loader, {bool force = false}) {
    if (!force && _fresh) return Future<T>.value(_value as T);
    if (!force && _inFlight != null) return _inFlight!;
    final future = loader().then((value) {
      _value = value;
      _time = DateTime.now();
      return value;
    }).whenComplete(() => _inFlight = null);
    _inFlight = future;
    return future;
  }

  void clear() {
    _value = null;
    _time = null;
    _inFlight = null;
  }
}

final _badgeCountCache = TimedMemoryCache<int>(const Duration(seconds: 8));
final _townPulsesCache =
    TimedMemoryCache<List<TownPulse>>(const Duration(seconds: 8));
final _presenceCache =
    TimedMemoryCache<List<OperatorPresence>>(const Duration(seconds: 6));

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

bool isActiveTownRow(Map<String, dynamic> row) {
  final deletedAt = '${rowVal(row, 'Deleted_At') ?? row['deleted_at'] ?? ''}'.trim();
  if (deletedAt.isNotEmpty && deletedAt.toLowerCase() != 'null') return false;
  final status = '${rowVal(row, 'Status') ?? row['status'] ?? 'Active'}'.trim().toLowerCase();
  return status != 'deleted' && status != 'inactive' && status != 'archived';
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
  final route = data['route'] ?? data['deepLinkTarget'] ?? routeForTable(data['table']);
  if ('$route' == 'daily_report' || '$route' == 'daily_ledger_receipts') {
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
  if (nextTab == 2 || nextTab == 4) {
    _badgeCountCache.clear();
    _townPulsesCache.clear();
    void ping() {
      liveRefreshNotifier.value++;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => ping());
    Timer(const Duration(milliseconds: 800), ping);
    Timer(const Duration(milliseconds: 1800), ping);
  }
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

DateTime? parseDateTime(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse('$value');
}

DateTime? parseAnyDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  final text = '$value'.trim();
  if (text.isEmpty || text.toLowerCase() == 'null') return null;
  return DateTime.tryParse(text) ??
      tryDateFormat('yyyy-MM-dd', text) ??
      tryDateFormat('dd MMM yyyy', text);
}

DateTime? tryDateFormat(String pattern, String value) {
  try {
    return DateFormat(pattern).parseStrict(value);
  } catch (_) {
    return null;
  }
}

String relativeTime(DateTime? value) {
  if (value == null) return 'Never online';
  final diff = DateTime.now().toUtc().difference(value.toUtc());
  if (diff.inSeconds < 60) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} hr ago';
  return shortDate.format(value.toLocal());
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
  final normalized = mapFromAny(value);
  if (normalized.isNotEmpty) {
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
      if (normalized[key] != null && '${normalized[key]}'.trim().isNotEmpty) {
        parts.add('$key: ${normalized[key]}');
      }
    }
    return parts.take(5).join(' - ');
  }
  return '$value';
}

Map<String, dynamic> mapFromAny(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty) return mapFromAny(value.first);
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      return mapFromAny(decoded);
    } catch (_) {
      return const {};
    }
  }
  return const {};
}

String appealTownName(Map<String, dynamic> appeal) {
  final data = mapFromAny(appeal['requested_data']);
  final user = mapFromAny(appeal['requested_by_user_id']);
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

Future<void> handleNotificationResponse(NotificationResponse response) async {
  final payload = response.payload;
  if (payload == null || payload.trim().isEmpty) return;
  if (payload.startsWith('appeal_action:')) {
    final appealId = payload.split(':').skip(1).join(':').trim();
    final actionId = response.actionId ?? '';
    if (appealId.isNotEmpty &&
        (actionId == 'approve_appeal' || actionId == 'reject_appeal')) {
      final status = actionId == 'approve_appeal' ? 'approved' : 'rejected';
      try {
        await supabase.rpc(
          'ceo_review_appeal',
          params: {'appeal_id': appealId, 'new_status': status},
        );
        _badgeCountCache.clear();
        _townPulsesCache.clear();
        liveRefreshNotifier.value++;
        return;
      } catch (_) {
        // If direct review fails, open approvals so CEO can retry manually.
      }
    }
    routeFromPushData({'route': 'appeals'});
    return;
  }
  routeFromPushData({'route': payload});
}

@pragma('vm:entry-point')
void ceoNotificationTapBackground(NotificationResponse response) {
  // Background isolate cannot safely navigate. The foreground response handler
  // processes action payloads when Android opens the app.
}
