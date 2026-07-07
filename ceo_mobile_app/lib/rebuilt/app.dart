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

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _checking = true;
  bool _showDashboard = false;
  bool _needsPasswordSetup = false;
  bool _needsBiometric = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) {
      setState(() {
        _checking = false;
        _showDashboard = false;
        _needsPasswordSetup = false;
        _needsBiometric = false;
      });
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final passwordSet = prefs.getBool('admin_password_set') ?? false;
    final biometricEnabled = prefs.getBool('biometric_enabled') ?? false;

    if (!passwordSet) {
      setState(() {
        _checking = false;
        _needsPasswordSetup = true;
        _showDashboard = false;
        _needsBiometric = false;
      });
      return;
    }

    if (biometricEnabled) {
      setState(() {
        _checking = false;
        _needsBiometric = true;
        _showDashboard = false;
        _needsPasswordSetup = false;
      });
      return;
    }

    setState(() {
      _checking = false;
      _showDashboard = true;
      _needsPasswordSetup = false;
      _needsBiometric = false;
    });
  }

  Future<void> _handleBiometricUnlock() async {
    try {
      final localAuth = LocalAuthentication();
      final authenticated = await localAuth.authenticate(
        localizedReason: 'Unlock AL SIRAJ CEO',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      if (!mounted) return;
      if (authenticated) {
        setState(() {
          _needsBiometric = false;
          _showDashboard = true;
        });
      }
    } catch (_) {
      // User cancelled or error — stay on unlock screen
    }
  }

  Future<void> _handleAdminPasswordUnlock(String password) async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('admin_password') ?? '';
    if (saved.isEmpty || saved != password) {
      throw Exception('Incorrect password');
    }
    if (!mounted) return;
    setState(() {
      _needsBiometric = false;
      _showDashboard = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_needsPasswordSetup) {
      return AdminPasswordSetup(
        onSetupComplete: () {
          setState(() {
            _needsPasswordSetup = false;
            _showDashboard = true;
          });
        },
      );
    }

    if (_needsBiometric) {
      return _BiometricUnlockScreen(
        onBiometric: _handleBiometricUnlock,
        onPassword: _handleAdminPasswordUnlock,
      );
    }

    if (_showDashboard) {
      return const CeoShell();
    }

    return LoginScreen(
      onLoggedIn: () {
        _checkAuth();
      },
    );
  }
}

class _BiometricUnlockScreen extends StatefulWidget {
  const _BiometricUnlockScreen({
    required this.onBiometric,
    required this.onPassword,
  });

  final Future<void> Function() onBiometric;
  final Future<void> Function(String password) onPassword;

  @override
  State<_BiometricUnlockScreen> createState() => _BiometricUnlockScreenState();
}

class _BiometricUnlockScreenState extends State<_BiometricUnlockScreen> {
  final _passwordController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tryBiometric();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _tryBiometric() async {
    setState(() => _error = null);
    await widget.onBiometric();
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
      if (mounted) setState(() => _error = '$e');
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
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: kBlue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Icon(Icons.fingerprint, size: 40, color: kBlue),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'App Locked',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Use your fingerprint or device PIN to unlock.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: kMuted, fontSize: 15),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _tryBiometric,
                      icon: const Icon(Icons.fingerprint),
                      label: const Text('Unlock with Fingerprint'),
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
                  const SizedBox(height: 24),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Administration Password',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: kRed)),
                  ],
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
                          : const Text('Unlock with Password'),
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
