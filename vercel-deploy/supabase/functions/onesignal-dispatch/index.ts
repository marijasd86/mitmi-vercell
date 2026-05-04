import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Payload = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function isTrue(value: unknown, defaultValue = true) {
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') || '';
    const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Missing Supabase env' }, 500);
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) return json({ error: 'Missing OneSignal env' }, 500);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authHeader } }
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user?.id) return json({ error: 'Unauthorized' }, 401);
    const actorId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.eventType || '').trim();
    const payload = (body?.payload || {}) as Payload;

    if (!eventType) return json({ error: 'Missing eventType' }, 400);

    const recipientIds = new Set<string>();
    let title = 'Svita';
    let message = 'Imaš novo obaveštenje.';
    let targetUrl = '/?open=notifications';

    if (eventType === 'message.sent') {
      const chatId = String(payload.chat_id || '');
      if (!chatId) return json({ ok: true, skipped: 'missing-chat-id' });
      const { data: participants } = await admin
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId);
      (participants || []).forEach((row: any) => {
        const uid = String(row?.user_id || '');
        if (uid && uid !== actorId) recipientIds.add(uid);
      });
      title = 'Nova poruka';
      const preview = String(payload.content_preview || '').trim();
      message = preview ? preview : 'Stigla ti je nova poruka u chatu.';
      targetUrl = '/?open=chats';
    }

    if (eventType === 'plan.confirmed') {
      const planId = String(payload.plan_id || '');
      if (!planId) return json({ ok: true, skipped: 'missing-plan-id' });
      const { data: plan } = await admin
        .from('event_pair_plans')
        .select('id,user_a_id,user_b_id,event_id,status')
        .eq('id', planId)
        .maybeSingle();
      if (!plan) return json({ ok: true, skipped: 'plan-not-found' });
      const a = String(plan.user_a_id || '');
      const b = String(plan.user_b_id || '');
      if (a && a !== actorId) recipientIds.add(a);
      if (b && b !== actorId) recipientIds.add(b);
      title = 'Dogovor potvrđen';
      message = 'Super, dogovor za događaj je potvrđen.';
      const eventId = String(plan.event_id || payload.event_id || '');
      targetUrl = eventId ? `/?open=event&id=${eventId}` : '/?open=notifications';
    }

    const ids = Array.from(recipientIds);
    if (!ids.length) return json({ ok: true, recipients: 0 });

    const { data: settings } = await admin
      .from('user_settings')
      .select('id,notif_messages,notif_plans,notif_invites')
      .in('id', ids);

    const settingMap = new Map<string, any>();
    (settings || []).forEach((row: any) => settingMap.set(String(row.id), row));

    const filteredIds = ids.filter((uid) => {
      const row = settingMap.get(uid) || {};
      if (eventType === 'message.sent') return isTrue(row.notif_messages, true);
      if (eventType === 'plan.confirmed') {
        const plans = isTrue(row.notif_plans, true);
        const invites = isTrue(row.notif_invites, plans);
        return plans && invites;
      }
      return true;
    });

    if (!filteredIds.length) return json({ ok: true, recipients: 0, filteredByPrefs: true });

    const pushRes = await fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${ONESIGNAL_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: {
          external_id: filteredIds
        },
        target_channel: 'push',
        headings: { en: title, sr: title },
        contents: { en: message, sr: message },
        web_url: targetUrl
      })
    });

    const pushBody = await pushRes.json().catch(() => ({}));

    await admin.from('push_notification_logs').insert({
      event_type: eventType,
      actor_id: actorId,
      recipient_ids: filteredIds,
      payload,
      onesignal_response: pushBody,
      status: pushRes.ok ? 'sent' : 'error'
    }).catch(() => {});

    if (!pushRes.ok) return json({ error: 'OneSignal request failed', details: pushBody }, 502);

    return json({ ok: true, recipients: filteredIds.length, response: pushBody });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
