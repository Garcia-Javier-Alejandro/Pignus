import { errorResponse, json } from '../../_lib/http.js';
import { getValidAccessToken } from '../../_lib/meliAuth.js';
import { fetchEnrichAndStore } from '../../_lib/fetchAndStore.js';

const ART_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina is always UTC-3 (no DST)

// Returns YYYY-MM-DD for a UTC epoch value, interpreted in ART
function artDateStr(utcMs) {
  const d = new Date(utcMs - ART_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const isPaid = (o) =>
  o.status === 'paid' || (o.payments || []).some((p) => p.status === 'approved');

export async function onRequestGet({ env }) {
  try {
    const now = Date.now();
    const todayART     = artDateStr(now);
    const yesterdayART = artDateStr(now - 24 * 60 * 60 * 1000);

    const tokens = await getValidAccessToken(env);
    const { access_token } = tokens;
    const sellerId = tokens.seller_id || env.MELI_SELLER_ID;

    // Probe total — needed to seed next_older_offset correctly on a fresh cache
    const probeRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(sellerId)}&limit=1&offset=0`,
      { headers: { accept: 'application/json', authorization: `Bearer ${access_token}` } },
    );
    const probeData = await probeRes.json();
    if (!probeRes.ok) throw new Error(probeData.message || probeData.error || 'ML probe failed');
    const total = probeData.paging?.total ?? 0;

    // ML date filter params are unreliable on orders/search.
    // Fetch the 50 most recent orders and filter client-side.
    const url = new URL('https://api.mercadolibre.com/orders/search');
    url.searchParams.set('seller', sellerId);
    url.searchParams.set('sort', 'date_desc');
    url.searchParams.set('limit', '50');
    url.searchParams.set('offset', '0');

    const res = await fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${access_token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'ML orders request failed');

    const recentOrders = (data.results || []).filter((o) => {
      if (!isPaid(o)) return false;
      const d = artDateStr(new Date(o.date_created).getTime());
      return d === todayART || d === yesterdayART;
    });

    const fetched_today     = recentOrders.filter((o) => artDateStr(new Date(o.date_created).getTime()) === todayART).length;
    const fetched_yesterday = recentOrders.length - fetched_today;

    // fetchedOffset = total so a fresh cache seeds next_older_offset = total - 20 (correct
    // starting point for the history import), while an existing cache keeps its offset unchanged.
    const result = await fetchEnrichAndStore(env, {
      orders: recentOrders,
      total,
      fetchedOffset: total,
      isOlderFetch: false,
    });

    return json({ ...result, fetched_today, fetched_yesterday });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
