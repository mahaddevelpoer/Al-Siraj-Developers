import 'package:flutter/material.dart';
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

    // Check admin password status
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

    // Check biometric if enabled
    if (biometricEnabled) {
      try {
        final localAuth = LocalAuthentication();
        final canCheck = await localAuth.canCheckBiometrics;
        final biometrics = await localAuth.getAvailableBiometrics();
        if (canCheck && biometrics.isNotEmpty) {
          final authenticated = await localAuth.authenticate(
            localizedReason: 'Open CEO app',
            options: const AuthenticationOptions(biometricOnly: true),
          );
          if (!authenticated) {
            setState(() {
              _checking = false;
              _showDashboard = false;
              _needsPasswordSetup = false;
              _needsBiometric = false;
            });
            return;
          }
        } else {
          // Fallback to device PIN/pattern
          final authenticated = await localAuth.authenticate(
            localizedReason: 'Open CEO app',
            options: const AuthenticationOptions(),
          );
          if (!authenticated) {
            setState(() {
              _checking = false;
              _showDashboard = false;
              _needsPasswordSetup = false;
              _needsBiometric = false;
            });
            return;
          }
        }
      } catch (_) {
        // If biometric fails, still allow access
      }
    }

    setState(() {
      _checking = false;
      _showDashboard = true;
      _needsPasswordSetup = false;
      _needsBiometric = false;
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

    if (_showDashboard) {
      return const CeoShell();
    }

    return LoginScreen(
      onLoggedIn: () {
        // After login, check password setup again
        _checkAuth();
      },
    );
  }
}
