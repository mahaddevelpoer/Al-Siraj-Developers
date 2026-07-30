import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'constants.dart';
import 'notification_service.dart';

class FcmHealthService {
  FcmHealthService._();

  static bool _checking = false;
  static DateTime? _lastHealthCheck;

  /// Runs complete diagnostic self-healing check on Firebase, channels, and FCM topics.
  static Future<void> ensureHealthy() async {
    if (_checking) return;
    if (_lastHealthCheck != null &&
        DateTime.now().difference(_lastHealthCheck!) < const Duration(minutes: 2)) {
      return;
    }

    _checking = true;
    try {
      // 1. Ensure Firebase Core is initialized
      try {
        await Firebase.initializeApp();
      } catch (e) {
        debugPrint('[FcmHealthService] Firebase core already initialized or error: $e');
      }

      // 2. Ensure Local Notification Service channels exist
      try {
        await CeoNotificationService.init();
      } catch (e) {
        debugPrint('[FcmHealthService] NotificationService init error: $e');
      }

      // 3. Ensure FCM Permission and Topic Subscription
      try {
        final messaging = FirebaseMessaging.instance;
        await messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
        await messaging.subscribeToTopic(ceoPushTopic);
        debugPrint('[FcmHealthService] Subscribed to topic $ceoPushTopic successfully');
      } catch (e) {
        debugPrint('[FcmHealthService] Topic subscription check error: $e');
      }

      _lastHealthCheck = DateTime.now();
    } finally {
      _checking = false;
    }
  }

  /// Syncs any missed pending appeals from Supabase on app open or push receipt.
  static Future<List<Map<String, dynamic>>> fetchMissedPendingAppeals() async {
    try {
      final rows = await Supabase.instance.client
          .from('appeals')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', ascending: false)
          .limit(50);
      return List<Map<String, dynamic>>.from(rows);
    } catch (e) {
      debugPrint('[FcmHealthService] Error fetching missed pending appeals: $e');
      return [];
    }
  }
}
