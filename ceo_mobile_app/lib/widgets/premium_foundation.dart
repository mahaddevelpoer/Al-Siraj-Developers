import 'package:flutter/material.dart';
import 'package:percent_indicator/linear_percent_indicator.dart';

import '../app_performance.dart';
import '../app_theme.dart';

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
    final lean = prefersLeanMotion(context);
    final radius = 18.0 * responsiveScale(context);
    final card = PressableScale(
      onTap: onTap,
      child: RepaintBoundary(
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: kSurface,
            borderRadius: BorderRadius.circular(
              radius.clamp(14, 20).toDouble(),
            ),
            border: Border.all(color: kBorder),
            boxShadow: lean
                ? const []
                : [
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
        duration: motionDuration(context, 120, leanMs: 40),
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
    final lean = prefersLeanMotion(context);
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
        boxShadow: lean
            ? const []
            : [
                BoxShadow(
                  color: colors.first.withValues(alpha: .18),
                  blurRadius: 14,
                  offset: const Offset(0, 7),
                ),
              ],
      ),
      child: Icon(icon, color: Colors.white, size: size * .48),
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
      duration: motionDuration(context, 360),
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
