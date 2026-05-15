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
    const todayART = artDateStr(Date.now());

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
    // Fetch the 50 most recent orders and filter to today's ART date client-side.
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

    const allResults = data.results || [];
    const todayOrders = allResults.filter(
      (o) => isPaid(o) && artDateStr(new Date(o.date_created).getTime()) === todayART,
    );

    // fetchedOffset = total so a fresh cache seeds next_older_offset = total - 20 (correct
    // starting point for the history import), while an existing cache keeps its offset unchanged.
    const result = await fetchEnrichAndStore(env, {
      orders: todayOrders,
      total,
      fetchedOffset: total,
      isOlderFetch: false,
    });

    return json({
      ...result,
      fetched_today: todayOrders.length,
      total_today: todayOrders.length,
      // Temporary debug fields — remove once date handling is confirmed correct
      _debug: {
        todayART,
        fetched_from_ml: allResults.length,
        sample_dates: allResults.slice(0, 3).map((o) => o.date_created),
      },
    });
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
