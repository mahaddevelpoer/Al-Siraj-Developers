// Scheduled daily report — triggered by Supabase cron at 8PM daily
// Falls back if the desktop app wasn't running at 8PM

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface ReportSummary {
  townName: string;
  propertiesSold: number;
  totalReceived: number;
  totalExpenses: number;
  dailyEntries: number;
  net: number;
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const today = new Date().toISOString().slice(0, 10);

    // 1. Check if report was already sent today
    const { data: existing } = await fetch(
      `${supabaseUrl}/rest/v1/rpc/ceo_mobile_daily_receipt_rows`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ p_report_date: today }),
      },
    ).then((r) => r.json()).catch(() => null);

    if (existing && Array.isArray(existing) && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already generated' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Get active towns
    const towns: Array<{ town_name: string }> = await fetch(
      `${supabaseUrl}/rest/v1/towns?select=town_name&deleted_at=is.null&status=eq.active`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    ).then((r) => r.json());

    // 3. Get today's entries
    const entries: Array<{ town_name: string; type: string; amount: number }> = await fetch(
      `${supabaseUrl}/rest/v1/daily_entries?select=town_name,type,amount&date=eq.${today}&review_status=neq.pending&review_status=neq.rejected`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    ).then((r) => r.json()).catch(() => []);

    // 4. Build summaries
    const summaries: ReportSummary[] = towns.map((t) => {
      const townEntries = entries.filter((e) => e.town_name === t.town_name);
      const income = townEntries.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
      const expense = townEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
      return {
        townName: t.town_name,
        propertiesSold: 0,
        totalReceived: income,
        totalExpenses: expense,
        dailyEntries: townEntries.length,
        net: income - expense,
      };
    });

    // 5. Send FCM push to CEO
    const { data: ceoDevices } = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id&role=eq.ceo&is_active=eq.true`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    ).then((r) => r.json()).catch(() => []);

    if (ceoDevices && ceoDevices.length > 0) {
      const message = summaries.map((s) => `${s.townName}: PKR ${s.net.toLocaleString()} net`).join('\n');
      await fetch(`${supabaseUrl}/functions/v1/send-ceo-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          title: '📊 Daily Town Report',
          body: message,
          data: { route: 'daily_report', type: 'daily_report', date: today },
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, townCount: towns.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
