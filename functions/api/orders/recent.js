import { errorResponse, json } from '../../_lib/http.js';
import { fetchLatestOrders } from '../../_lib/meliOrders.js';
import { fetchEnrichAndStore } from '../../_lib/fetchAndStore.js';

export async function onRequestGet({ env }) {
  try {
    const { orders, total, fetchedOffset } = await fetchLatestOrders(env, 20);
    const result = await fetchEnrichAndStore(env, { orders, total, fetchedOffset, isOlderFetch: false });
    return json(result);
  } catch (error) {
    return errorResponse(500, error.message);
  }
}
