import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../app_theme.dart';

class StartupSplashScreen extends StatefulWidget {
  const StartupSplashScreen({super.key});

  @override
  State<StartupSplashScreen> createState() => _StartupSplashScreenState();
}

class _StartupSplashScreenState extends State<StartupSplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Premium gradient background
          const _SplashBackground(),

          // Subtle decorative circles
          Positioned(
            top: -80,
            right: -80,
            child: _GlowCircle(color: kPrimary.withValues(alpha: .08), size: 320),
          ),
          Positioned(
            bottom: -60,
            left: -60,
            child: _GlowCircle(color: kSecondary.withValues(alpha: .07), size: 260),
          ),

          // Main content
          SafeArea(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo container with glow
                  RepaintBoundary(
                    child: AnimatedBuilder(
                      animation: _pulse,
                      builder: (context, child) {
                        return Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: kPrimary.withValues(
                                  alpha: 0.08 + _pulse.value * 0.10,
                                ),
                                blurRadius: 40 + _pulse.value * 20,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                          child: child,
                        );
                      },
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(34),
                          border: Border.all(
                            color: const Color(0xFFE2E8F0),
                            width: 1.5,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: kInk.withValues(alpha: .10),
                              blurRadius: 32,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        padding: const EdgeInsets.all(16),
                        child: SvgPicture.asset(
                          'assets/logo.svg',
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  )
                      .animate()
                      .fadeIn(duration: 500.ms, curve: Curves.easeOut)
                      .scale(
                        begin: const Offset(.82, .82),
                        end: const Offset(1, 1),
                        duration: 600.ms,
                        curve: Curves.easeOutBack,
                      ),

                  const SizedBox(height: 28),

                  // Brand name
                  const Text(
                    'AL SIRAJ DEVELOPERS',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: kText,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: .5,
                    ),
                  )
                      .animate(delay: 200.ms)
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: .15, curve: Curves.easeOut),

                  const SizedBox(height: 6),

                  // Tagline
                  Text(
                    'CEO command center',
                    style: TextStyle(
                      color: kMuted.withValues(alpha: .85),
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: .2,
                    ),
                  )
                      .animate(delay: 320.ms)
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: .15, curve: Curves.easeOut),

                  const SizedBox(height: 48),

                  // Progress bar
                  SizedBox(
                    width: 100,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        minHeight: 3,
                        backgroundColor: kPrimary.withValues(alpha: .12),
                        valueColor: AlwaysStoppedAnimation<Color>(
                          kPrimary.withValues(alpha: .7),
                        ),
                      ),
                    ),
                  )
                      .animate(delay: 450.ms)
                      .fadeIn(duration: 400.ms),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowCircle extends StatelessWidget {
  const _GlowCircle({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
      ),
    );
  }
}

class SvgPictureAssetLogo extends StatelessWidget {
  const SvgPictureAssetLogo({super.key, this.size = 96});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/logo.svg',
      width: size,
      height: size,
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

class _SplashBackground extends StatelessWidget {
  const _SplashBackground();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFF8FAFC),
            Color(0xFFF0F9FF),
            Color(0xFFEFF6FF),
          ],
        ),
      ),
    );
  }
}
