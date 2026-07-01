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
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    return {
      data: null,
      error: {
        message: 'Online accountant login is required before creating an appeal.',
      },
    };
  }

  const normalized = {
    ...payload,
    requested_by_user_id: authData.user.id,
    status: payload.status || 'pending',
    town_name: payload.town_name || payload.townName || payload.requested_data?.townName || payload.requested_data?.town || '',
  };
  normalized.town_name = String(normalized.town_name || '').trim();

  const rpc = await supabase.rpc('create_business_appeal', {
    p_requested_by_user_id: normalized.requested_by_user_id,
    p_requested_by_role: normalized.requested_by_role,
    p_appeal_type: normalized.appeal_type,
    p_entity_type: normalized.entity_type,
    p_entity_id: String(normalized.entity_id || ''),
    p_town_name: normalized.town_name,
    p_original_data: normalized.original_data || null,
    p_requested_data: normalized.requested_data || {},
    p_reason: normalized.reason || '',
    p_otp_code: normalized.otp_code || null,
    p_otp_expires_at: normalized.otp_expires_at || null,
  });

  if (rpc.error) {
    if (isMissingRpc(rpc.error, 'create_business_appeal')) return { data: null, error: repairError(rpc.error) };
    return { data: null, error: rpc.error };
  }
  return { data: rpc.data, error: null };
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
