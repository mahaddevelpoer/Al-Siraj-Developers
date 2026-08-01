import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../components/admin_password_setup.dart';
import 'constants.dart';
import 'screens.dart';

class RebuiltCeoApp extends StatelessWidget {
  const RebuiltCeoApp({super.key});

  @override
  Widget build(BuildContext context) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: kBlue,
        brightness: Brightness.light,
        surface: kSurface,
      ),
      scaffoldBackgroundColor: kBg,
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: kBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: kLine),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: kLine),
        ),
      ),
    );
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AL SIRAJ CEO',
      theme: base.copyWith(textTheme: GoogleFonts.interTextTheme(base.textTheme)),
      home: const AuthGate(),
    );
  }
}

// ─── AuthGate ───────────────────────────────────────────────────────────────

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

enum _AppScreen { loading, login, passwordSetup, unlock, terms, dashboard }

class _AuthGateState extends State<AuthGate> with WidgetsBindingObserver {
  _AppScreen _screen = _AppScreen.loading;
  bool _biometricEnabled = false;

  // Session-level flag: once unlocked, stays unlocked until genuinely backgrounded.
  bool _unlockedThisSession = false;

  // Track when app was last paused to decide if re-lock is needed.
  DateTime? _pausedAt;

  // How long the app must be backgrounded before re-locking (like WhatsApp).
  static const _lockAfter = Duration(seconds: 30);

  // Single instance — never create multiple LocalAuthentication objects.
  final _localAuth = LocalAuthentication();

  // Prevent concurrent authenticate() calls (causes auth_in_progress).
  bool _authInFlight = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // ── Lifecycle: Instant Auto-Lock on background or app switch ──
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      if (_unlockedThisSession) {
        _unlockedThisSession = false;
        if (mounted) {
          setState(() => _screen = _AppScreen.unlock);
        }
      }
    }
  }

  // ── Initial boot ──
  Future<void> _boot() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) {
      setState(() => _screen = _AppScreen.login);
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final passwordSet = prefs.getBool('admin_password_set') ?? false;

    if (!passwordSet) {
      setState(() => _screen = _AppScreen.passwordSetup);
      return;
    }

    final termsAccepted = prefs.getBool('al_siraj_terms_accepted') ?? false;
    if (!termsAccepted) {
      setState(() => _screen = _AppScreen.terms);
      return;
    }

    _biometricEnabled = prefs.getBool('biometric_enabled') ?? false;

    if (_biometricEnabled && !_unlockedThisSession) {
      setState(() => _screen = _AppScreen.unlock);
    } else {
      _unlockedThisSession = true;
      setState(() => _screen = _AppScreen.dashboard);
    }
  }

  // ── Biometric unlock (called from _UnlockScreen) ──
  Future<bool> _doBiometricAuth() async {
    if (_authInFlight) return false; // prevent auth_in_progress
    _authInFlight = true;
    try {
      final ok = await _localAuth.authenticate(
        localizedReason: 'Unlock AL SIRAJ CEO',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      if (ok && mounted) {
        _unlockedThisSession = true;
        setState(() => _screen = _AppScreen.dashboard);
      }
      return ok;
    } finally {
      _authInFlight = false;
    }
  }

  // ── Password unlock ──
  Future<void> _doPasswordUnlock(String password) async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('admin_password') ?? '';
    if (saved.isEmpty || saved != password) {
      throw Exception('Incorrect password');
    }
    if (!mounted) return;
    _unlockedThisSession = true;
    setState(() => _screen = _AppScreen.dashboard);
  }

  // ── Build ──
  @override
  Widget build(BuildContext context) {
    switch (_screen) {
      case _AppScreen.loading:
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );

      case _AppScreen.login:
        return LoginScreen(onLoggedIn: () => _boot());

      case _AppScreen.passwordSetup:
        return AdminPasswordSetup(
          onSetupComplete: () {
            _unlockedThisSession = true;
            setState(() => _screen = _AppScreen.dashboard);
          },
        );

      case _AppScreen.unlock:
        return _UnlockScreen(
          hasBiometrics: _biometricEnabled,
          onBiometric: _doBiometricAuth,
          onPassword: _doPasswordUnlock,
        );

      case _AppScreen.terms:
        return TermsScreen(
          onAccept: () async {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setBool('al_siraj_terms_accepted', true);
            _boot();
          },
        );

      case _AppScreen.dashboard:
        return const CeoShell();
    }
  }
}

// ─── Unlock Screen ──────────────────────────────────────────────────────────

class _UnlockScreen extends StatefulWidget {
  const _UnlockScreen({
    required this.hasBiometrics,
    required this.onBiometric,
    required this.onPassword,
  });

  final bool hasBiometrics;
  final Future<bool> Function() onBiometric;
  final Future<void> Function(String password) onPassword;

  @override
  State<_UnlockScreen> createState() => _UnlockScreenState();
}

class _UnlockScreenState extends State<_UnlockScreen> {
  final _passwordController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Auto-prompt biometric after first frame is drawn
    if (widget.hasBiometrics) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _tryBiometric();
      });
    }
  }

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _tryBiometric() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ok = await widget.onBiometric();
      // If not ok (user cancelled), just reset busy — stay on screen
      if (!ok && mounted) {
        setState(() => _error = null);
      }
    } catch (e) {
      if (mounted) {
        final raw = e.toString();
        String msg;
        if (raw.contains('auth_in_progress')) {
          msg = 'Please wait, authentication is in progress...';
        } else if (raw.contains('NotAvailable') || raw.contains('NotEnrolled')) {
          msg = 'Biometrics not available. Use your password instead.';
        } else {
          msg = raw.replaceAll('Exception: ', '').replaceAll('PlatformException', 'Error');
        }
        setState(() => _error = msg);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitPassword() async {
    final password = _passwordController.text.trim();
    if (password.isEmpty) {
      setState(() => _error = 'Enter your administration password');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onPassword(password);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceAll('Exception: ', ''));
      }
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
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Lock icon
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: kBlue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(
                      widget.hasBiometrics ? Icons.fingerprint : Icons.lock,
                      size: 40,
                      color: kBlue,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Title
                  Text(
                    widget.hasBiometrics ? 'App Locked' : 'Enter Password',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.hasBiometrics
                        ? 'Use your fingerprint or device PIN to unlock.'
                        : 'Enter your administration password to continue.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: kMuted, fontSize: 15),
                  ),

                  // Biometric button
                  if (widget.hasBiometrics) ...[
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _busy ? null : _tryBiometric,
                        icon: _busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.fingerprint),
                        label: Text(_busy ? 'Verifying...' : 'Unlock with Fingerprint'),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or', style: TextStyle(color: kMuted)),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                  ],

                  // Password field
                  SizedBox(height: widget.hasBiometrics ? 24 : 32),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Administration Password',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock),
                    ),
                    onSubmitted: (_) => _submitPassword(),
                  ),

                  // Error message
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: kRed)),
                  ],

                  // Password unlock button
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _submitPassword,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Unlock'),
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
