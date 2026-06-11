const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_AUDIENCE = "https://oauth2.googleapis.com/token";
const CEO_TOPIC = "ceo-alerts";

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
            notification: {
              channel_id: "ceo_live_alerts",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
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

  if (table === "appeals") {
    return {
      title: event === "UPDATE" ? "Appeal updated" : "New appeal",
      body: "A request needs CEO review",
      data: { table, event, id, route },
    };
  }

  if (table === "notifications") {
    return {
      title: event === "UPDATE" ? "Notification updated" : "Business notification",
      body: "A business alert needs CEO attention",
      data: { table, event, id, route },
    };
  }

  if (table === "daily_entries") {
    return {
      title: event === "UPDATE" ? "Daily entry updated" : "Daily entry added",
      body: "An income or expense entry needs CEO review",
      data: { table, event, id, route },
    };
  }

  return {
    title: "CEO alert",
    body: "Open CEO app for details",
    data: { table, event, id, route },
  };
}

function routeForTable(table: string) {
  if (table === "appeals") return "appeals";
  if (table === "notifications") return "notifications";
  if (table === "daily_entries") return "entries";
  return "home";
}

async function getAccessToken(serviceAccount: ServiceAccount) {
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
  return body.access_token as string;
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
