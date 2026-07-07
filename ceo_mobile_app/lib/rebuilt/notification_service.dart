import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'constants.dart';

final notificationTapStream = StreamController<Map<String, dynamic>>.broadcast();
final notificationActionStream = StreamController<Map<String, dynamic>>.broadcast();

@pragma('vm:entry-point')
Future<void> ceoFirebaseBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

class CeoNotificationService {
  CeoNotificationService._();

  static final plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> init() async {
    if (_ready) return;
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidInit);
    await plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        final actionId = response.actionId;
        
        if (payload == null || payload.trim().isEmpty) return;
        try {
          final data = Map<String, dynamic>.from(jsonDecode(payload));
          
          // Check if action button was pressed
          if (actionId == 'approve' || actionId == 'reject') {
            final status = actionId == 'approve' ? 'approved' : 'rejected';
            final appealId = data['id'] ?? '';
            if (appealId.isNotEmpty) {
              notificationActionStream.add({'id': appealId, 'status': status});
              _handleNotificationAction(appealId, status);
            }
            return;
          }
          
          notificationTapStream.add(data);
        } catch (_) {
          notificationTapStream.add({'route': payload});
        }
      },
    );
    final android = plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        'ceo_approvals',
        'CEO Approvals',
        description: 'Pending CEO approval alerts',
        importance: Importance.high,
      ),
    );
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        'ceo_daily_reports',
        'Daily Reports',
        description: 'Daily ledger receipt alerts',
        importance: Importance.high,
      ),
    );
    _ready = true;
  }

  // Handle approve/reject action from notification (works even when app is in background)
  static Future<void> _handleNotificationAction(String appealId, String status) async {
    try {
      await Supabase.instance.client.rpc(
        'ceo_review_appeal',
        params: {'appeal_id': appealId, 'new_status': status},
      );
      print('[NOTIFICATION] Appeal $appealId $status via notification action');
      
      // Show confirmation notification
      await showLocal(
        title: 'Appeal ${status == 'approved' ? 'Approved' : 'Rejected'}',
        body: 'You ${status == 'approved' ? "approved" : "rejected"} the appeal.',
        routeData: {'route': 'approvals'},
        channelId: 'ceo_approvals',
      );
    } catch (e) {
      print('[NOTIFICATION] Failed to $status appeal: $e');
    }
  }

  static Future<void> startFcm() async {
    try {
      FirebaseMessaging.onBackgroundMessage(ceoFirebaseBackgroundHandler);
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      await messaging.subscribeToTopic(ceoPushTopic);
      FirebaseMessaging.onMessage.listen(showRemoteMessage);
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        notificationTapStream.add(_routeFromMessage(message));
      });
      final initial = await messaging.getInitialMessage();
      if (initial != null) notificationTapStream.add(_routeFromMessage(initial));
    } catch (_) {
      // FCM must never block app startup.
    }
  }

  static Future<void> showRemoteMessage(RemoteMessage message) async {
    final routeData = _routeFromMessage(message);
    final route = '${routeData['route'] ?? ''}';
    final table = '${message.data['table'] ?? ''}';
    final isApproval = route == 'approvals' || table == 'appeals';
    final isReport = route == 'reports' || route == 'daily_report';
    if (!isApproval && !isReport) return;
    await showLocal(
      title: message.notification?.title ??
          (isReport ? 'Daily ledger receipt ready' : 'Pending CEO approval'),
      body: message.notification?.body ?? 'Open AL SIRAJ CEO to review.',
      routeData: routeData,
      channelId: isReport ? 'ceo_daily_reports' : 'ceo_approvals',
    );
  }

  static Future<void> showLocal({
    required String title,
    required String body,
    required Map<String, dynamic> routeData,
    required String channelId,
  }) async {
    await init();
    await plugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelId == 'ceo_daily_reports' ? 'Daily Reports' : 'CEO Approvals',
          importance: Importance.high,
          priority: Priority.high,
          icon: 'ic_stat_ceo_notification',
          actions: channelId == 'ceo_approvals'
              ? const [
                  AndroidNotificationAction('approve', 'Approve', showsUserInterface: true),
                  AndroidNotificationAction('reject', 'Reject', showsUserInterface: true),
                ]
              : null,
        ),
      ),
      payload: jsonEncode(routeData),
    );
  }

  static Map<String, dynamic> _routeFromMessage(RemoteMessage message) {
    final route = '${message.data['route'] ?? message.data['deepLinkTarget'] ?? ''}';
    final table = '${message.data['table'] ?? ''}';
    final id = '${message.data['id'] ?? message.data['appeal_id'] ?? message.data['entry_id'] ?? ''}';
    final event = '${message.data['event'] ?? ''}';
    if (route == 'daily_report' || route == 'daily_ledger_receipts') {
      return {'route': 'reports', 'id': id, 'event': event};
    }
    if (route == 'approvals' || route == 'appeals' || table == 'appeals') {
      return {'route': 'approvals', 'table': table, 'id': id, 'event': event};
    }
    return {'route': route.isEmpty ? 'home' : route, 'table': table, 'id': id, 'event': event};
  }
}
