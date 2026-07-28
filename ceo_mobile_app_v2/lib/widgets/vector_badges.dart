import 'package:flutter/material.dart';

import '../app_performance.dart';

class AnimatedEntry extends StatelessWidget {
  const AnimatedEntry({super.key, required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (prefersLeanMotion(context) || index > 5) {
      return RepaintBoundary(child: child);
    }
    final delayIndex = index.clamp(0, 3).toInt();
    return RepaintBoundary(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Duration(milliseconds: 95 + (delayIndex * 10)),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 5 * (1 - value)),
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
