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
final liveRefreshNotifier = ValueNotifier<int>(0);
final appStartedAt = DateTime.now();
const startupSplashDuration = Duration(seconds: 3);
Future<void>? _firebaseStartupFuture;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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

const kBg = Color(0xFFF5F7FA);
const kSurface = Color(0xFFFFFFFF);
const kPrimary = Color(0xFF6C63FF);
const kSecondary = Color(0xFF00C9A7);
const kText = Color(0xFF1A1D2E);
const kMuted = Color(0xFF8A94A6);
const kBorder = Color(0x12000000);

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

class OperatorPresence {
  const OperatorPresence({
    required this.id,
    required this.name,
    required this.role,
    required this.townName,
    required this.isOnline,
    this.lastSeenAt,
    this.deviceLabel = '',
    this.activeContext = '',
  });

  final String id;
  final String name;
  final String role;
  final String townName;
  final bool isOnline;
  final DateTime? lastSeenAt;
  final String deviceLabel;
  final String activeContext;
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

class StartupSplashGate extends StatefulWidget {
  const StartupSplashGate({super.key});

  @override
  State<StartupSplashGate> createState() => _StartupSplashGateState();
}

class _StartupSplashGateState extends State<StartupSplashGate> {
  bool _done = false;

  @override
  void initState() {
    super.initState();
    Timer(startupSplashDuration, () {
      if (mounted) setState(() => _done = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 380),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: _done ? const AuthGate() : const StartupSplashScreen(),
    );
  }
}

class StartupSplashScreen extends StatelessWidget {
  const StartupSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const PremiumBackground(),
          SafeArea(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Hero(
                    tag: 'app-brand-mark',
                    child: const AppBrandMark(size: 108),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'AL SIRAJ DEVELOPERS',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: kText,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'CEO command center',
                    style: TextStyle(
                      color: kMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AppBrandMark extends StatelessWidget {
  const AppBrandMark({super.key, this.size = 64});
  final double size;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(size * .22),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0F172A).withValues(alpha: .18),
              blurRadius: size * .22,
              offset: Offset(0, size * .10),
            ),
          ],
        ),
        child: CustomPaint(painter: AppBrandMarkPainter()),
      ),
    );
  }
}

class AppBrandMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final teal = Paint()..color = const Color(0xFF14B8A6);
    final white = Paint()..color = Colors.white;
    final blue = Paint()..color = const Color(0xFF60A5FA);
    final whiteSoft = Paint()..color = Colors.white.withValues(alpha: .85);

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * .18, h * .72, w * .64, h * .075),
        Radius.circular(w * .012),
      ),
      teal,
    );
    canvas.drawRect(Rect.fromLTWH(w * .26, h * .44, w * .11, h * .24), white);
    canvas.drawRect(Rect.fromLTWH(w * .45, h * .32, w * .11, h * .36), white);
    canvas.drawRect(Rect.fromLTWH(w * .64, h * .38, w * .11, h * .30), white);

    final roof = Path()
      ..moveTo(w * .20, h * .42)
      ..lineTo(w * .50, h * .20)
      ..lineTo(w * .80, h * .42)
      ..lineTo(w * .75, h * .50)
      ..lineTo(w * .50, h * .33)
      ..lineTo(w * .25, h * .50)
      ..close();
    canvas.drawPath(roof, blue);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * .29, h * .83, w * .42, h * .04),
        Radius.circular(w * .01),
      ),
      whiteSoft,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
                const SliverToBoxAdapter(child: SizedBox(height: 10)),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.list(
                    children: [
                      const LoginHeroCard(),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: kSurface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: kBorder),
          boxShadow: [
            BoxShadow(
              color: kPrimary.withValues(alpha: .07),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          children: [
            const Hero(tag: 'app-brand-mark', child: AppBrandMark(size: 62)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text(
                    'AL SIRAJ DEVELOPERS',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: kText,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'CEO approvals, daily ledgers and town balances.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: kMuted,
                      fontWeight: FontWeight.w700,
                      height: 1.25,
                    ),
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
  final List<dynamic> _channels = [];
  StreamSubscription<RemoteMessage>? _foregroundPushSub;
  StreamSubscription<RemoteMessage>? _openedPushSub;
  Timer? _liveRefreshTimer;
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
    void scheduleLiveRefresh() {
      if (_liveRefreshTimer?.isActive == true) return;
      _liveRefreshTimer = Timer(const Duration(milliseconds: 250), () {
        _badgeCountCache.clear();
        _townPulsesCache.clear();
        _presenceCache.clear();
        liveRefreshNotifier.value++;
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
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'users',
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
    _liveRefreshTimer?.cancel();
    _presenceHeartbeatTimer?.cancel();
    _writePresence('offline', contextLabel: 'ceo_mobile_app_closed');
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
        child: Container(
          height: 72,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: kBorder),
            boxShadow: [
              BoxShadow(
                color: kPrimary.withValues(alpha: .12),
                blurRadius: 24,
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
      cacheExtent: 900,
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
          padding: padding,
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
    final data = await loader();
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
    final data = await primary();
    return List<Map<String, dynamic>>.from(data);
  } catch (_) {
    return safeSelectRows(fallback);
  }
}

Future<int> loadNotificationBadgeCount({bool force = false}) {
  return _badgeCountCache.get(_loadNotificationBadgeCountUncached, force: force);
}

Future<int> _loadNotificationBadgeCountUncached() async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final rows = await Future.wait<List<Map<String, dynamic>>>([
    safeSelectRows(
      () => supabase
          .from('appeals')
          .select('id,status')
          .eq('status', 'pending')
          .limit(120),
    ),
    safeSelectRows(
      () => supabase
          .from('daily_entries')
          .select('id,review_status')
          .eq('review_status', 'pending')
          .limit(120),
    ),
    safeSelectRows(
      () => supabase
          .from('notifications')
          .select('id,dismissed')
          .eq('dismissed', 'No')
          .limit(120),
    ),
    safeSelectRows(
      () => supabase
          .from('media_library')
          .select('id,type,report_date')
          .eq('type', 'daily_ledger_receipt')
          .eq('report_date', today)
          .limit(80),
    ),
  ]);
  return rows.fold<int>(0, (sum, list) => sum + list.length);
}

Future<List<CeoInboxItem>> loadCeoInboxItems() async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final results = await Future.wait<List<Map<String, dynamic>>>([
    safeSelectRows(
      () => supabase
          .from('appeals')
          .select(
            'id,appeal_type,status,created_at,town_name,requested_data,requested_by_user_id(full_name,email,town_name)',
          )
          .eq('status', 'pending')
          .order('created_at', ascending: false)
          .limit(60),
    ),
    safeSelectRows(
      () => supabase
          .from('daily_entries')
          .select('*')
          .eq('review_status', 'pending')
          .order('created_at', ascending: false)
          .limit(60),
    ),
    safeSelectRows(
      () => supabase
          .from('notifications')
          .select('*')
          .eq('dismissed', 'No')
          .order('created_date', ascending: false)
          .limit(60),
    ),
    safeSelectRows(
      () => supabase
          .from('media_library')
          .select('*')
          .eq('type', 'daily_ledger_receipt')
          .eq('report_date', today)
          .order('created_at', ascending: false)
          .limit(60),
    ),
  ]);

  final items = <CeoInboxItem>[];
  for (final row in results[0]) {
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

  for (final row in results[1]) {
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

  for (final row in results[2]) {
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

  for (final row in results[3]) {
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
  return _townPulsesCache.get(_loadTownPulsesUncached, force: force);
}

Future<List<TownPulse>> _loadTownPulsesUncached() async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final results = await Future.wait<List<Map<String, dynamic>>>([
    resilientSelectRows(
      () => supabase
          .from('towns')
          .select('town_name,status,deleted_at')
          .order('town_name'),
      () => supabase.from('towns').select('*').order('town_name'),
    ),
    resilientSelectRows(
      () => supabase
          .from('appeals')
          .select(
            'id,status,town_name,requested_data,requested_by_user_id(full_name,email,town_name,town_id)',
          )
          .eq('status', 'pending'),
      () => supabase.from('appeals').select('*').eq('status', 'pending'),
    ),
    resilientSelectRows(
      () => supabase
          .from('daily_entries')
          .select(
            'id,entry_id,date,type,amount,town_name,review_status,created_at',
          ),
      () => supabase.from('daily_entries').select('*'),
    ),
    resilientSelectRows(
      () => supabase
          .from('all_sales')
          .select(
            'id,sale_id,type,plot_shop_number,town_name,customer_name,received_amount,advance_amount_pkr,remaining_amount,created_at',
          ),
      () => supabase.from('all_sales').select('*'),
    ),
    resilientSelectRows(
      () => supabase
          .from('users')
          .select('full_name,town_name,town_id,role')
          .eq('role', 'accountant'),
      () => supabase.from('users').select('*').eq('role', 'accountant'),
    ),
  ]);

  final towns = results[0].where(isActiveTownRow).toList();
  final appeals = results[1];
  final entries = results[2];
  final sales = results[3];
  final accountants = results[4];

  final names = <String>{
    ...towns.map((t) => '${rowVal(t, 'Town_Name')}'.trim()),
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

Future<List<OperatorPresence>> loadOperatorPresence({bool force = false}) {
  return _presenceCache.get(_loadOperatorPresenceUncached, force: force);
}

Future<List<OperatorPresence>> _loadOperatorPresenceUncached() async {
  List<Map<String, dynamic>> rows;
  try {
    rows = List<Map<String, dynamic>>.from(
      await supabase
          .from('users')
          .select(
            'id,email,full_name,role,town_name,town_id,online_status,last_seen_at,device_label,last_active_context',
          ),
    );
  } catch (_) {
    rows = List<Map<String, dynamic>>.from(
      await supabase
          .from('users')
          .select('id,email,full_name,role,town_name,town_id'),
    );
  }

  final now = DateTime.now().toUtc();
  return rows
      .where((row) {
        final role = '${row['role'] ?? ''}'.toLowerCase();
        return role == 'ceo' || role == 'accountant';
      })
      .map((row) {
        final lastSeen = parseDateTime(row['last_seen_at']);
        final status = '${row['online_status'] ?? ''}'.toLowerCase();
        final recent = lastSeen != null && now.difference(lastSeen.toUtc()) <= const Duration(seconds: 90);
        final name = '${row['full_name'] ?? row['email'] ?? 'Unknown user'}'.trim();
        final townName = '${row['town_name'] ?? row['town_id'] ?? 'All towns'}'.trim();
        return OperatorPresence(
          id: '${row['id'] ?? row['email'] ?? name}',
          name: name.isEmpty ? 'Unknown user' : name,
          role: '${row['role'] ?? 'user'}'.trim(),
          townName: townName.isEmpty || townName == 'null' ? 'All towns' : townName,
          isOnline: status == 'online' && recent,
          lastSeenAt: lastSeen,
          deviceLabel: '${row['device_label'] ?? ''}'.trim(),
          activeContext: '${row['last_active_context'] ?? ''}'.trim(),
        );
      })
      .toList()
    ..sort((a, b) {
      if (a.isOnline != b.isOnline) return a.isOnline ? -1 : 1;
      return a.townName.compareTo(b.townName);
    });
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
    liveRefreshNotifier.addListener(_handleLiveRefresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_handleLiveRefresh);
    super.dispose();
  }

  void _handleLiveRefresh() {
    if (!mounted || _reviewing) return;
    final next = _load();
    setState(() {
      _future = next;
      _error = null;
    });
    unawaited(
      next
          .then((rows) {
            if (mounted) setState(() => _items = rows);
            return rows;
          })
          .catchError((e) {
            if (mounted) setState(() => _error = friendlyDbError(e));
            return <Map<String, dynamic>>[];
          }),
    );
  }

  Future<List<Map<String, dynamic>>> _load() async {
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

    rows = rows
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
    liveRefreshNotifier.addListener(_handleLiveRefresh);
  }

  @override
  void dispose() {
    liveRefreshNotifier.removeListener(_handleLiveRefresh);
    super.dispose();
  }

  void _handleLiveRefresh() {
    if (!mounted || _reviewing) return;
    final next = _load();
    setState(() {
      _future = next;
      _error = null;
    });
    unawaited(
      next
          .then((rows) {
            if (mounted) setState(() => _items = rows);
            return rows;
          })
          .catchError((e) {
            if (mounted) setState(() => _error = friendlyDbError(e));
            return <Map<String, dynamic>>[];
          }),
    );
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final query = supabase.from('daily_entries').select('*');
    final data = await query.eq('review_status', _filter).limit(80);
    final rows = List<Map<String, dynamic>>.from(data)
        .where(
          (row) => reviewStatusOf(row) == _filter,
        )
        .toList();
    rows.sort((a, b) {
      final bDate = '${rowVal(b, 'Date') ?? rowVal(b, 'created_at') ?? ''}';
      final aDate = '${rowVal(a, 'Date') ?? rowVal(a, 'created_at') ?? ''}';
      return bDate.compareTo(aDate);
    });
    return rows;
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
    final day = DateFormat('yyyy-MM-dd').format(_date);
    final results = await Future.wait<dynamic>([
      supabase
          .from('daily_entries')
          .select('*')
          .order('created_at', ascending: false),
      supabase.from('towns').select('*'),
    ]);
    var mediaRows = <Map<String, dynamic>>[];
    try {
      final media = await supabase
          .from('media_library')
          .select('*')
          .eq('type', 'daily_ledger_receipt')
          .eq('report_date', day)
          .order('created_at', ascending: false);
      mediaRows = List<Map<String, dynamic>>.from(media);
    } catch (_) {
      mediaRows = <Map<String, dynamic>>[];
    }
    final data = results[0];
    final activeTownNames = List<Map<String, dynamic>>.from(
      results[1],
    ).where(isActiveTownRow).map((town) => '${rowVal(town, 'Town_Name')}'.trim()).toSet();
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
      if (town.isNotEmpty && town != 'null') townSet.add(town);
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

  Future<List<Map<String, dynamic>>> _load() async {
    final data = await supabase.from('towns').select('*').order('town_name');
    return List<Map<String, dynamic>>.from(data).where(isActiveTownRow).toList();
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
    return Hero(
          tag: 'header-$title',
          child: Material(
            color: Colors.transparent,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
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
                      color: const Color(0xFF2563EB).withValues(alpha: .22),
                      blurRadius: 34,
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
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .18),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .22),
                            ),
                          ),
                          child: Icon(icon, color: Colors.white),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .14),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .16),
                            ),
                          ),
                          child: const Text(
                            'CEO',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: compact ? 25 : 30,
                        fontWeight: FontWeight.w900,
                        height: 1.02,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      subtitle,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xDDFFFFFF),
                        height: 1.45,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
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
    if (index > 14) return RepaintBoundary(child: child);
    final delayIndex = index.clamp(0, 8).toInt();
    return RepaintBoundary(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Duration(milliseconds: 180 + (delayIndex * 18)),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 8 * (1 - value)),
            child: child,
          ),
        ),
        child: child,
      ),
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
    final payload = route.isNotEmpty ? route : routeForTable(table);
    await show(title, body, payload: payload);
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
      largeIcon: DrawableResourceAndroidBitmap('ic_launcher'),
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
