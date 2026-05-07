import { getValidAccessToken, refreshAccessToken } from './meliAuth.js';

const PAGE_SIZE = 50;

const isPaidOrder = (order) => (
  order.status === 'paid'
  || (order.payments || []).some((payment) => payment.status === 'approved')
);

async function requestOrders(params, accessToken) {
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

// Fetch all orders using scroll (cursor) pagination. More efficient for large result sets.
async function fetchWithScroll(sellerId, accessToken) {
  const orders = [];
  let scrollId;

  do {
    const response = await requestOrders({
      seller: sellerId,
      search_type: 'scan',
      limit: String(PAGE_SIZE),
      ...(scrollId ? { scroll_id: scrollId } : {}),
    }, accessToken);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Mercado Libre orders request failed');
    }

    const results = data.results || [];
    orders.push(...results);
    scrollId = data.scroll_id;

    if (!results.length) break;
  } while (scrollId);

  return orders;
}

// Fetch all orders using offset pagination. Accepts extra params (e.g. date filters).
async function fetchWithOffset(sellerId, accessToken, extraParams = {}) {
  const orders = [];
  let offset = 0;
  let total = null;

  do {
    const response = await requestOrders({
      seller: sellerId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...extraParams,
    }, accessToken);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Mercado Libre orders request failed');
    }

    const results = data.results || [];
    orders.push(...results);
    total = data.paging?.total ?? orders.length;
    offset += results.length;

    if (!results.length) break;
  } while (offset < total);

  return orders;
}

// Fetch every paid order. Used by the scheduled cron and the manual export endpoint.
export async function fetchAllPaidOrders(env) {
  const tokens = await getValidAccessToken(env);
  const sellerId = tokens.seller_id || env.MELI_SELLER_ID;
  let orders;

  try {
    orders = await fetchWithScroll(sellerId, tokens.access_token);
  } catch {
    // Scroll pagination can be unavailable on some accounts; fall back to offset.
    const refreshed = await refreshAccessToken(env);
    orders = await fetchWithOffset(sellerId, refreshed.access_token);
  }

  return orders.filter(isPaidOrder);
}

// Fetch paid orders created within the last `days` days. Used by the preview endpoint.
export async function fetchRecentPaidOrders(env, days = 30) {
  const tokens = await getValidAccessToken(env);
  const sellerId = tokens.seller_id || env.MELI_SELLER_ID;
  const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // The API date filter param is unreliable, so we fetch all and filter in code.
  const orders = await fetchWithOffset(sellerId, tokens.access_token);

  return orders
    .filter(isPaidOrder)
    .filter((o) => o.date_created && o.date_created >= dateFrom);
}

// Fetch full order detail (including payments[].fee_details) for a list of orders.
// The search endpoint omits fee_details; individual order fetches include them.
export async function enrichOrders(orders, env) {
  const tokens = await getValidAccessToken(env);

  return Promise.all(orders.map(async (order) => {
    const res = await fetch(`https://api.mercadolibre.com/orders/${order.id}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${tokens.access_token}`,
      },
    });

    return res.ok ? res.json() : order;
  }));
}
