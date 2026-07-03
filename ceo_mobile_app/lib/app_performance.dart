import 'package:flutter/material.dart';

bool prefersLeanMotion(BuildContext context) {
  final media = MediaQuery.maybeOf(context);
  if (media == null) return false;
  return media.disableAnimations ||
      media.size.width < 430 ||
      media.devicePixelRatio < 2.25;
}

Duration motionDuration(
  BuildContext context,
  int normalMs, {
  int leanMs = 0,
}) {
  return Duration(milliseconds: prefersLeanMotion(context) ? leanMs : normalMs);
}

double responsiveScale(BuildContext context) {
  final width = MediaQuery.maybeSizeOf(context)?.width ?? 390;
  if (width < 360) return .88;
  if (width < 390) return .92;
  if (width < 430) return .96;
  return 1;
}

EdgeInsets responsivePagePadding(BuildContext context) {
  final scale = responsiveScale(context);
  return EdgeInsets.fromLTRB(18 * scale, 16 * scale, 18 * scale, 104);
}
