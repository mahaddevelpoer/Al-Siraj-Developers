import { supabase } from './supabase';

function isMissingRpc(error, name) {
  return String(error?.message || '').toLowerCase().includes(String(name || '').toLowerCase());
}

function repairError(error) {
  return {
    ...error,
    message: 'Appeal database repair is not installed. Run src/sql/appeals-accountant-rls-fix.sql once in Supabase SQL Editor.',
  };
}

export async function createBusinessAppeal(payload) {
  // ─── PRIORITY 1: Electron IPC bridge (works with ANY login type) ─────────
  // This uses the Service Role Admin key in main process — bypasses RLS,
  // works regardless of whether user logged in via Email, Passkey, Admin Password
  if (window?.api?.createAppeal) {
    try {
      const normalized = {
        ...payload,
        town_name: String(payload.town_name || payload.townName || payload.requested_data?.townName || payload.requested_data?.town || '').trim(),
        status: 'pending',
      };
      const result = await window.api.createAppeal(normalized);
      if (result && !result.error) {
        return { data: result.data, error: null };
      }
      // If IPC returned an error, fall through to Supabase client
      console.warn('[createBusinessAppeal] IPC returned error, trying Supabase client:', result?.error?.message);
    } catch (ipcErr) {
      console.warn('[createBusinessAppeal] IPC call failed, trying Supabase client:', ipcErr.message);
    }
  }

  // ─── PRIORITY 2: Supabase client (for browser/web context) ───────────────
  const { data: authData, error: authError } = await supabase.auth.getUser().catch(() => ({ data: null, error: new Error('Network error') }));
  if (authError || !authData?.user?.id) {
    // No auth — save locally and queue for later sync
    const localId = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const now = new Date();
    const localAppeal = {
      id: localId,
      townName: payload.town_name || payload.townName || payload.requested_data?.townName || payload.requested_data?.town || '',
      type: payload.appeal_type || 'general',
      description: payload.reason || '',
      payload: payload,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      nextReminderAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    };
    const tName = String(localAppeal.townName || '').trim();
    const key = `al_siraj_pending_appeals_${tName || 'global'}`;
    let old = [];
    try {
      old = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_) {}
    localStorage.setItem(key, JSON.stringify([localAppeal, ...old].slice(0, 100)));
    try {
      if (window.api?.saveLocalPendingAppeal) {
        await window.api.saveLocalPendingAppeal(localAppeal);
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('al-siraj-business-data-changed', {
      detail: { townName: tName, events: ['appeal:pending-local'] },
    }));
    return {
      data: {
        id: localId,
        status: 'pending',
        appeal_type: payload.appeal_type,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        town_name: tName,
        requested_data: payload.requested_data,
        reason: payload.reason,
        is_local: true,
      },
      error: null,
    };
  }

  const normalized = {
    ...payload,
    requested_by_user_id: authData.user.id,
    status: payload.status || 'pending',
    town_name: payload.town_name || payload.townName || payload.requested_data?.townName || payload.requested_data?.town || '',
  };
  normalized.town_name = String(normalized.town_name || '').trim();

  const { data, error } = await supabase
    .from('appeals')
    .insert({
      requested_by_user_id: normalized.requested_by_user_id,
      requested_by_role: normalized.requested_by_role,
      appeal_type: normalized.appeal_type,
      entity_type: normalized.entity_type,
      entity_id: String(normalized.entity_id || ''),
      town_name: normalized.town_name,
      original_data: normalized.original_data || null,
      requested_data: normalized.requested_data || {},
      reason: normalized.reason || '',
      otp_code: normalized.otp_code || null,
      otp_expires_at: normalized.otp_expires_at || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { data: null, error };
  return { data, error: null };
}


export async function setBusinessAppealOtp(appealId, otpCode, expiresAt) {
  const rpc = await supabase.rpc('set_business_appeal_otp', {
    p_appeal_id: appealId,
    p_otp_code: otpCode,
    p_otp_expires_at: expiresAt || null,
  });
  if (rpc.error) {
    if (isMissingRpc(rpc.error, 'set_business_appeal_otp')) return { data: null, error: repairError(rpc.error) };
    return { data: null, error: rpc.error };
  }
  return { data: rpc.data, error: null };
}

export async function verifyBusinessAppealOtp(appealId, otpCode) {
  const rpc = await supabase.rpc('verify_business_appeal_otp', {
    p_appeal_id: appealId,
    p_otp_code: otpCode,
  });
  if (rpc.error) {
    if (isMissingRpc(rpc.error, 'verify_business_appeal_otp')) return { data: null, error: repairError(rpc.error) };
    return { data: null, error: rpc.error };
  }
  return { data: rpc.data, error: null };
}
