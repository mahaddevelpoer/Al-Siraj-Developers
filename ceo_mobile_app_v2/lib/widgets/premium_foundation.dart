import 'package:flutter/material.dart';
import 'package:percent_indicator/linear_percent_indicator.dart';

import '../app_performance.dart';
import '../app_theme.dart';

class PremiumBackground extends StatelessWidget {
  const PremiumBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: kBg,
      ),
      child: Stack(
        children: [
          Positioned(
            top: -120,
            left: -90,
            child: _SoftField(
              size: 260,
              color: Color(0xFFDBEAFE),
            ),
          ),
          Positioned(
            right: -110,
            top: 130,
            child: _SoftField(
              size: 230,
              color: Color(0xFFD1FAE5),
            ),
          ),
          Positioned(
            left: 18,
            right: 18,
            bottom: 80,
            child: Container(
              height: 180,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(44),
                gradient: LinearGradient(
                  colors: [
                    Colors.white.withValues(alpha: .62),
                    Colors.white.withValues(alpha: .08),
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

class _SoftField extends StatelessWidget {
  const _SoftField({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            color.withValues(alpha: .70),
            color.withValues(alpha: .0),
          ],
        ),
      ),
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
    final radius = 20.0 * responsiveScale(context);
    final card = PressableScale(
      onTap: onTap,
      child: RepaintBoundary(
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: kSurface,
            borderRadius: BorderRadius.circular(
              radius.clamp(16, 24).toDouble(),
            ),
            border: Border.all(color: Colors.white.withValues(alpha: .78)),
            boxShadow: lean
                ? const []
                : [
                    BoxShadow(
                      color: const Color(0xFF101828).withValues(alpha: .07),
                      blurRadius: 22,
                      offset: const Offset(0, 12),
                    ),
                    BoxShadow(
                      color: kPrimary.withValues(alpha: .045),
                      blurRadius: 36,
                      offset: const Offset(0, 18),
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
