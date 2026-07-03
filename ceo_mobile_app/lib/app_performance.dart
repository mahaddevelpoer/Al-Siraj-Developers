import 'package:flutter/material.dart';

bool prefersLeanMotion(BuildContext context) {
  final media = MediaQuery.maybeOf(context);
  if (media == null) return false;
  return media.disableAnimations || media.size.width < 390;
}

Duration motionDuration(
  BuildContext context,
  int normalMs, {
  int leanMs = 0,
}) {
  return Duration(milliseconds: prefersLeanMotion(context) ? leanMs : normalMs);
}
