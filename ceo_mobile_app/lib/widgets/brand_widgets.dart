import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app_theme.dart';

class StartupSplashScreen extends StatelessWidget {
  const StartupSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          _SplashBackground(),
          SafeArea(
            child: Center(
              child: RepaintBoundary(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Hero(
                      tag: 'app-logo',
                      child: SvgPictureAssetLogo(size: 104),
                    ),
                    SizedBox(height: 18),
                    Text(
                      'AL SIRAJ DEVELOPERS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: kText,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'CEO command center',
                      style: TextStyle(
                        color: kMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 22),
                    SizedBox(
                      width: 112,
                      child: LinearProgressIndicator(
                        minHeight: 4,
                        borderRadius: BorderRadius.all(Radius.circular(99)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
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
            Color(0xFFF4F7F6),
            Color(0xFFEFF6FF),
          ],
        ),
      ),
    );
  }
}
