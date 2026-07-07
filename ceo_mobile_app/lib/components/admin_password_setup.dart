import 'dart:async';

import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../rebuilt/constants.dart';

class AdminPasswordSetup extends StatefulWidget {
  const AdminPasswordSetup({super.key, required this.onSetupComplete});
  final VoidCallback onSetupComplete;

  @override
  State<AdminPasswordSetup> createState() => _AdminPasswordSetupState();
}

class _AdminPasswordSetupState extends State<AdminPasswordSetup> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;
  bool _biometricEnabled = false;
  bool _hasBiometrics = false;
  String? _error;

  final LocalAuthentication _localAuth = LocalAuthentication();

  @override
  void initState() {
    super.initState();
    _checkBiometric();
    _loadBiometricSetting();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _checkBiometric() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final biometrics = await _localAuth.getAvailableBiometrics();
      setState(() {
        _hasBiometrics = canCheck && biometrics.isNotEmpty;
      });
    } catch (_) {}
  }

  Future<void> _loadBiometricSetting() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      setState(() {
        _biometricEnabled = prefs.getBool('biometric_enabled') ?? false;
      });
    } catch (_) {}
  }

  Future<void> _setPassword() async {
    if (_passwordController.text.length < 4) {
      setState(() => _error = 'Password must be at least 4 characters');
      return;
    }
    if (_passwordController.text != _confirmController.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('admin_password', _passwordController.text);
      await prefs.setBool('admin_password_set', true);
      
      widget.onSetupComplete();
    } catch (e) {
      setState(() => _error = 'Failed to save password: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleBiometric(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('biometric_enabled', enabled);
    if (mounted) setState(() => _biometricEnabled = enabled);
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
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                children: [
                  const Icon(Icons.shield, size: 64, color: kAccent),
                  const SizedBox(height: 24),
                  const Text(
                    'Set Administration Password',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'This password is required to approve or reject appeals.\n'
                    'This prevents unauthorized access if someone uses your phone.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: kMuted),
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Administration Password',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _confirmController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Confirm Password',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: kRed)),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _setPassword,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _loading
                          ? const CircularProgressIndicator()
                          : const Text('Set Password'),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Divider(),
                  const SizedBox(height: 16),
                  const Text(
                    'Device Lock',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _hasBiometrics
                        ? 'Use fingerprint or device PIN to open the app — just like WhatsApp.'
                        : 'Use your device PIN/pattern/password to open the app — just like WhatsApp.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: kMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    title: const Text('Enable Device Lock'),
                    subtitle: Text(_biometricEnabled
                        ? 'Lock screen will appear on app open'
                        : 'Tap to enable'),
                    value: _biometricEnabled,
                    onChanged: _toggleBiometric,
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
