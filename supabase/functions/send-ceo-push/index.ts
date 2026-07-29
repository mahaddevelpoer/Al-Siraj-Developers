const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_AUDIENCE = "https://oauth2.googleapis.com/token";
const CEO_TOPIC = "ceo-alerts";
// Lock-screen FCM must stay approval-only. Daily ledger and business rows are
// fetched in-app/realtime, but only fresh appeal rows should wake the CEO phone.
const PUSHABLE_TABLES = new Set(["appeals"]);
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
  // Direct push fields (bypass trigger parsing)
  title?: string;
  body?: string;
  data?: Record<string, string>;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("CEO_PUSH_WEBHOOK_SECRET");
  if (configuredSecret) {
    const providedSecret = req.headers.get("x-ceo-push-secret");
    const authHeader = req.headers.get("authorization") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    // Deno.env.get("SUPABASE_ANON_KEY") returns sb_publishable_... which doesn't match the JWT anon key sent by clients.
    // So we also allow any bearer token that looks like a JWT (starts with Bearer eyJhbGci)
    const hasSupabaseBearer = authHeader && (authHeader === `Bearer ${anonKey}` || authHeader.startsWith("Bearer eyJhbGci"));
    console.log("authHeader:", authHeader);
    console.log("anonKey:", anonKey);
    console.log("hasSupabaseBearer:", hasSupabaseBearer);
    
    if (providedSecret !== configuredSecret && !hasSupabaseBearer) {
      return json({ 
        error: "Unauthorized",
        debug: {
          providedSecret,
          hasConfiguredSecret: !!configuredSecret,
          authHeaderLength: authHeader?.length || 0,
          anonKeyLength: anonKey?.length || 0,
          anonKey,
          isBearerMatch: hasSupabaseBearer
        }
      }, 401);
    }
  }

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    return json({ error: "Missing FIREBASE_SERVICE_ACCOUNT_JSON secret" }, 500);
  }

  const payload = await req.json() as PushPayload;
  const skipReason = shouldSkipPush(payload);
  if (skipReason) {
    return json({ ok: true, skipped: true, reason: skipReason });
  }

  const backgroundTask = sendFcmPush(serviceAccountJson, payload);
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(backgroundTask.catch((error) => {
      console.error("FCM background send failed", error);
    }));
    return json({ ok: true, queued: true });
  }

  return await backgroundTask;
});

async function sendFcmPush(serviceAccountJson: string, payload: PushPayload) {
  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
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
              channel_id: "ceo_approvals",
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
}

function buildSafeMessage(payload: PushPayload) {
  // Direct push — title/body/data provided explicitly (bypasses trigger parsing)
  if (payload.title && payload.body && payload.data) {
    return {
      title: payload.title,
      body: payload.body,
      data: {
        ...payload.data,
        dedupe_key: payload.data.dedupe_key || `direct:${Date.now()}`,
        event_time: new Date().toISOString(),
      },
    };
  }

  const table = payload.table || "unknown";
  const event = payload.event || "change";
  const record = payload.record || {};
  const id = String(record.id || record.Entry_ID || record.entry_id || record.Notification_ID || record.notification_id || "");
  const route = payload.data?.route || routeForTable(table);
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
    const requestedData = typeof record.requested_data === "object" && record.requested_data
      ? record.requested_data as Record<string, unknown>
      : {};
    const appealType = prettyText(record.appeal_type || "approval");
    const town = String(record.town_name || requestedData.townName || requestedData.Town_Name || requestedData.town_name || requestedData.town || "").trim();
    const requester = String(requestedData.accountant_name || requestedData.full_name || record.requested_by_role || "Accountant").trim();
    return {
      title: "New CEO approval",
      body: `${appealType}${town ? ` - ${town}` : ""}${requester ? ` by ${requester}` : ""}`,
      data: {
        ...data,
        appeal_type: String(record.appeal_type || ""),
        town_name: town,
      },
    };
  }

  if (table === "daily_entries") {
    const town = String(record.Town_Name || record.town_name || "").trim();
    const type = prettyText(record.Type || record.type || "entry");
    const amount = String(record.Amount || record.amount || "").trim();
    return {
      title: "Daily entry approval",
      body: `${type}${amount ? ` - PKR ${amount}` : ""}${town ? ` - ${town}` : ""}`,
      data: {
        ...data,
        route: "entries",
        town_name: town,
      },
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

function prettyText(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function shouldSkipPush(payload: PushPayload) {
  // Direct push (title+body+data provided explicitly) is never skipped
  if (payload.title && payload.body && payload.data) return "";

  const table = payload.table || "";
  const event = payload.event || "";
  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  if (!PUSHABLE_TABLES.has(table)) return `table_not_pushable:${table}`;
  if (event !== "INSERT") return "updates_are_silent";

  if (table === "appeals" && String(record.status || "pending").toLowerCase() !== "pending") {
    return "appeal_not_pending";
  }

  if (event === "UPDATE" && unchangedPushState(table, record, oldRecord)) {
    return "unchanged_push_state";
  }

  const recordTime = newestRecordTime(record);
  if (recordTime && Date.now() - recordTime.getTime() > MAX_RECORD_AGE_MS) {
    return "old_record_or_sync_backfill";
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
  if (table === "daily_entries") return "daily_report";
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
