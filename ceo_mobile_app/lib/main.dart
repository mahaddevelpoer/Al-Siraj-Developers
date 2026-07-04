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

  try {
    await Firebase.initializeApp();
  } catch (_) {
    // CEO app must still open if Firebase is temporarily unavailable.
  }

  await Supabase.initialize(
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  );

  try {
    await CeoNotificationService.init();
  } catch (_) {
    // Local notification setup is non-blocking.
  }

  runApp(const RebuiltCeoApp());
}
