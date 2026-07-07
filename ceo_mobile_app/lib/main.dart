import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'rebuilt/app.dart';
import 'rebuilt/constants.dart';
import 'rebuilt/notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
  };

  // Do not block app startup with Firebase and Notification initialization
  // to reduce the splash screen time.
  unawaited(Future(() async {
    try {
      await Firebase.initializeApp();
    } catch (_) {}
    try {
      await CeoNotificationService.init();
    } catch (_) {}
  }));

  await Supabase.initialize(
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  );

  runApp(const RebuiltCeoApp());
}
