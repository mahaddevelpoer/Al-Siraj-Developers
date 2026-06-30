import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.CEO_EMAIL;
const password = process.env.CEO_PASSWORD;
const fullName = process.env.CEO_FULL_NAME || 'AL SIRAJ CEO';

if (!url || !serviceKey || !email || !password) {
  console.error(JSON.stringify({
    success: false,
    error: 'Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CEO_EMAIL, CEO_PASSWORD',
  }, null, 2));
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

async function findUserByEmail(targetEmail) {
  let page = 1;
  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data?.users?.find((user) => String(user.email || '').toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (!data?.users?.length || data.users.length < 100) return null;
    page += 1;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(email);
  let user = existing;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata || {}),
        full_name: fullName,
        role: 'ceo',
      },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'ceo',
      },
    });
    if (error) throw error;
    user = data.user;
  }

  const profile = {
    id: user.id,
    email,
    full_name: fullName,
    role: 'ceo',
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase
    .from('users')
    .upsert(profile, { onConflict: 'id' });
  if (profileError) throw profileError;

  console.log(JSON.stringify({
    success: true,
    action: existing ? 'updated_existing_ceo' : 'created_new_ceo',
    email,
    userId: user.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
  process.exit(1);
});
