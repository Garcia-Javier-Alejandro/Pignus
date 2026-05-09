import { json, requireAdmin } from '../_lib/http.js';

const EDITS_KEY = 'edits';

const empty = () => ({ manualRows: [], hiddenIds: [], mlOverrides: {} });

export async function onRequestGet({ request, env }) {
  const err = await requireAdmin(request, env);
  if (err) return err;
  return json(await env.PIGNUS_TOKENS.get(EDITS_KEY, 'json') || empty());
}

export async function onRequestPost({ request, env }) {
  const err = await requireAdmin(request, env);
  if (err) return err;
  const body = await request.json();
  await env.PIGNUS_TOKENS.put(EDITS_KEY, JSON.stringify({
    manualRows:  body.manualRows  || [],
    hiddenIds:   body.hiddenIds   || [],
    mlOverrides: body.mlOverrides || {},
  }));
  return json({ ok: true });
}
