import { errorResponse, json } from '../../../../_lib/http.js';
import { exchangeCode } from '../../../../_lib/meliAuth.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return errorResponse(400, 'Mercado Libre authorization failed', oauthError);
  }

  if (!code) {
    return errorResponse(400, 'Missing Mercado Libre authorization code');
  }

  try {
    const tokens = await exchangeCode(env, code);

    return json({
      ok: true,
      seller_id: tokens.seller_id,
      expires_at: tokens.expires_at,
      refresh_token_stored: Boolean(tokens.refresh_token),
    });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
