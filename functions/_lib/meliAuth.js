const TOKEN_KEY = 'meli_tokens';

const getExpiresAt = (expiresInSeconds) => (
  new Date(Date.now() + Number(expiresInSeconds || 0) * 1000).toISOString()
);

export async function getStoredTokens(env) {
  const tokens = await env.PIGNUS_TOKENS.get(TOKEN_KEY, 'json');
  return tokens || {};
}

export async function storeTokens(env, tokens) {
  await env.PIGNUS_TOKENS.put(TOKEN_KEY, JSON.stringify(tokens));
}

export async function exchangeCode(env, code) {
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.MELI_APP_ID,
      client_secret: env.MELI_CLIENT_SECRET,
      code,
      redirect_uri: env.MELI_REDIRECT_URI,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Mercado Libre authorization exchange failed');
  }

  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: getExpiresAt(data.expires_in),
    seller_id: String(data.user_id || env.MELI_SELLER_ID || ''),
  };

  await storeTokens(env, tokens);
  return tokens;
}

export async function refreshAccessToken(env) {
  const current = await getStoredTokens(env);

  if (!current.refresh_token) {
    throw new Error('Missing Mercado Libre refresh token in KV');
  }

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.MELI_APP_ID,
      client_secret: env.MELI_CLIENT_SECRET,
      refresh_token: current.refresh_token,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Mercado Libre token refresh failed');
  }

  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: getExpiresAt(data.expires_in),
    seller_id: String(data.user_id || current.seller_id || env.MELI_SELLER_ID || ''),
  };

  await storeTokens(env, tokens);
  return tokens;
}

export async function getValidAccessToken(env) {
  const tokens = await getStoredTokens(env);
  const expiresAt = Date.parse(tokens.expires_at || '');
  const shouldRefresh = (
    tokens.refresh_token
    && (!tokens.access_token || Number.isNaN(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000)
  );

  if (shouldRefresh) {
    return refreshAccessToken(env);
  }

  if (!tokens.access_token) {
    throw new Error('Missing Mercado Libre access token in KV');
  }

  return tokens;
}
