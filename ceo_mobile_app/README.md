# AL SIRAJ CEO Mobile App

Flutter Android dashboard for the CEO.

## Scope

- CEO login only.
- Read-only balance, notification, and town performance views.
- Realtime online teams view: CEO can see which CEO/accountant devices are online and when they were last seen.
- Pending appeals can be approved or rejected.
- Daily income/expense entries can be marked approved or rejected.
- Town prices, plots, shops, and inventory cannot be edited from mobile.
- Supabase Realtime shows Android local notifications for new appeals, business notifications, and daily entries while the app is open or alive in the background.

## Notification Reality

Supabase Realtime is a websocket. It is excellent while the app is running, but Android can stop websockets when the app is fully closed/killed. True WhatsApp-style delivery after a force close needs Android push transport.

Free production path:

- Use Firebase Cloud Messaging for Android push transport. FCM itself is free.
- Keep Supabase as the source of truth.
- Trigger FCM from Supabase Edge Functions or database webhooks when appeals/notifications/daily entries are inserted.

No paid subscription is required for the normal FCM + Supabase free-tier setup, but a Firebase project and `google-services.json` are needed.

## Setup

Run these SQL files once in Supabase SQL Editor:

1. `src/sql/ceo-mobile-app.sql` for daily entry review actions.
2. `src/sql/user-presence.sql` for realtime online/last-seen status.

For FCM push:

1. Confirm `android/app/google-services.json` is for package `com.mahad.alsiraj.ceo`.
2. Run `flutter pub get`.
3. Deploy `supabase/functions/send-ceo-push`.
4. Add Supabase Edge Function secrets:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `CEO_PUSH_WEBHOOK_SECRET`
5. Update placeholders and run `src/sql/ceo-mobile-push-triggers.sql`.

Then run:

```sh
flutter pub get
flutter run
```
