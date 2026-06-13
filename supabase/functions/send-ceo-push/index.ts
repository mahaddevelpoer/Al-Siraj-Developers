const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_AUDIENCE = "https://oauth2.googleapis.com/token";
const CEO_TOPIC = "ceo-alerts";
const PUSHABLE_TABLES = new Set(["appeals", "notifications", "daily_entries"]);
const MAX_RECORD_AGE_MS = 5 * 60 * 1000;
let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type PushPayload = {
  table?: string;
  event?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("CEO_PUSH_WEBHOOK_SECRET");
  if (configuredSecret) {
    const providedSecret = req.headers.get("x-ceo-push-secret");
    if (providedSecret !== configuredSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    return json({ error: "Missing FIREBASE_SERVICE_ACCOUNT_JSON secret" }, 500);
  }

  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  const payload = await req.json() as PushPayload;
  const skipReason = shouldSkipPush(payload);
  if (skipReason) {
    return json({ ok: true, skipped: true, reason: skipReason });
  }
  const safeMessage = buildSafeMessage(payload);
  const token = await getAccessToken(serviceAccount);

  const fcmResponse = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          topic: CEO_TOPIC,
          notification: {
            title: safeMessage.title,
            body: safeMessage.body,
          },
          data: safeMessage.data,
          android: {
            priority: "HIGH",
            collapse_key: safeMessage.data.dedupe_key,
            ttl: "30s",
            notification: {
              channel_id: "ceo_live_alerts",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              tag: safeMessage.data.dedupe_key,
            },
          },
        },
      }),
    },
  );

  const responseBody = await fcmResponse.text();
  if (!fcmResponse.ok) {
    return json({ error: "FCM send failed", details: responseBody }, 502);
  }

  return json({ ok: true, fcm: JSON.parse(responseBody) });
});

function buildSafeMessage(payload: PushPayload) {
  const table = payload.table || "unknown";
  const event = payload.event || "change";
  const record = payload.record || {};
  const id = String(record.id || record.Entry_ID || record.entry_id || record.Notification_ID || record.notification_id || "");
  const route = routeForTable(table);
  const eventTime = new Date().toISOString();
  const dedupeKey = `${table}:${event}:${id || fingerprintRecord(record)}`;
  const data = {
    table,
    event,
    id,
    route,
    event_time: eventTime,
    dedupe_key: dedupeKey,
  };

  if (table === "appeals") {
    return {
      title: event === "UPDATE" ? "Appeal updated" : "New appeal",
      body: "A request needs CEO review",
      data,
    };
  }

  if (table === "notifications") {
    return {
      title: event === "UPDATE" ? "Notification updated" : "Business notification",
      body: "A business alert needs CEO attention",
      data,
    };
  }

  if (table === "daily_entries") {
    return {
      title: event === "UPDATE" ? "Daily entry updated" : "Daily entry added",
      body: "An income or expense entry needs CEO review",
      data,
    };
  }

  if (table === "all_sales") {
    return {
      title: event === "UPDATE" ? "Sale updated" : "Property sold",
      body: "A property sale was recorded",
      data,
    };
  }

  if (table === "properties") {
    return {
      title: "Property updated",
      body: "A plot or shop record changed",
      data,
    };
  }

  if (table === "installments") {
    return {
      title: "Installment updated",
      body: "An installment record needs attention",
      data,
    };
  }

  if (table === "expenses") {
    return {
      title: event === "UPDATE" ? "Expense updated" : "Expense added",
      body: "An expense entry was recorded",
      data,
    };
  }

  return {
    title: "CEO alert",
    body: "Open CEO app for details",
    data,
  };
}

function shouldSkipPush(payload: PushPayload) {
  const table = payload.table || "";
  const event = payload.event || "";
  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  if (!PUSHABLE_TABLES.has(table)) return `table_not_pushable:${table}`;
  if (event !== "INSERT") return "updates_are_silent";

  if (table === "appeals" && String(record.status || "pending").toLowerCase() !== "pending") {
    return "appeal_not_pending";
  }

  if (table === "daily_entries" && String(record.review_status || record.Review_Status || "pending").toLowerCase() !== "pending") {
    return "daily_entry_not_pending";
  }

  if (event === "UPDATE" && unchangedPushState(table, record, oldRecord)) {
    return "unchanged_push_state";
  }

  const recordTime = newestRecordTime(record);
  if (recordTime && Date.now() - recordTime.getTime() > MAX_RECORD_AGE_MS) {
    return "old_record_or_sync_backfill";
  }
  if (isPastBusinessDate(record)) {
    return "old_business_date";
  }

  return "";
}

function unchangedPushState(
  table: string,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown>,
) {
  if (table === "appeals") {
    return String(record.status || "") === String(oldRecord.status || "");
  }
  if (table === "daily_entries") {
    return String(record.review_status || record.Review_Status || "") ===
      String(oldRecord.review_status || oldRecord.Review_Status || "");
  }
  if (table === "notifications") {
    return String(record.dismissed || record.Dismissed || "") ===
      String(oldRecord.dismissed || oldRecord.Dismissed || "") &&
      String(record.status || record.Status || "") === String(oldRecord.status || oldRecord.Status || "");
  }
  return false;
}

function newestRecordTime(record: Record<string, unknown>) {
  const fields = [
    "updated_at",
    "created_at",
    "reviewed_at",
    "Created_At",
    "Updated_At",
    "created_date",
    "Created_Date",
  ];
  for (const field of fields) {
    const parsed = parseRecordTime(record[field]);
    if (parsed) return parsed;
  }
  return null;
}

function isPastBusinessDate(record: Record<string, unknown>) {
  const value = record.date || record.Date;
  if (!value) return false;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const recordStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  return recordStart < todayStart;
}

function parseRecordTime(value: unknown) {
  if (!value) return null;
  const raw = String(value);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function fingerprintRecord(record: Record<string, unknown>) {
  const parts = [
    record.Entry_ID,
    record.entry_id,
    record.Notification_ID,
    record.notification_id,
    record.Reference,
    record.reference,
    record.Date,
    record.date,
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return parts.length ? parts.map((value) => String(value)).join(":") : crypto.randomUUID();
}

function routeForTable(table: string) {
  if (table === "appeals") return "appeals";
  if (table === "notifications") return "notifications";
  if (table === "daily_entries") return "entries";
  if (table === "all_sales") return "activity";
  if (table === "properties") return "activity";
  if (table === "expenses") return "activity";
  if (table === "installments") return "notifications";
  return "home";
}

async function getAccessToken(serviceAccount: ServiceAccount) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: serviceAccount.client_email,
      scope: FCM_SCOPE,
      aud: FCM_AUDIENCE,
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
  );

  const response = await fetch(FCM_AUDIENCE, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`OAuth token failed: ${JSON.stringify(body)}`);
  }
  cachedAccessToken = body.access_token as string;
  cachedAccessTokenExpiresAt = Date.now() + ((Number(body.expires_in) || 3600) * 1000);
  return cachedAccessToken;
}

async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKeyPem: string) {
  const encoder = new TextEncoder();
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll("\\n", "")
    .replaceAll("\n", "")
    .trim();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
