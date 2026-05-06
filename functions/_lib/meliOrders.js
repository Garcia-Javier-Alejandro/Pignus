import { getValidAccessToken, refreshAccessToken } from './meliAuth.js';

const PAGE_SIZE = 20;

async function requestOrders(env, params, accessToken) {
  const url = new URL('https://api.mercadolibre.com/orders/search');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function fetchPaidOrders(env, limit = 10) {
  let tokens = await getValidAccessToken(env);
  let response = await requestOrders(env, {
    seller: tokens.seller_id || env.MELI_SELLER_ID,
    limit: String(Math.min(limit, PAGE_SIZE)),
    offset: '0',
  }, tokens.access_token);

  if (response.status === 401 && tokens.refresh_token) {
    tokens = await refreshAccessToken(env);
    response = await requestOrders(env, {
      seller: tokens.seller_id || env.MELI_SELLER_ID,
      limit: String(Math.min(limit, PAGE_SIZE)),
      offset: '0',
    }, tokens.access_token);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Mercado Libre orders request failed');
  }

  return (data.results || []).filter((order) => (
    order.status === 'paid'
    || (order.payments || []).some((payment) => payment.status === 'approved')
  ));
}
