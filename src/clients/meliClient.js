import axios from 'axios';
import { config, requireEnv } from '../config/env.js';
import { getMeliAccessToken, refreshMeliAccessToken, shouldRefreshMeliToken } from './meliAuthClient.js';
import { withRetry } from '../utils/retry.js';

const client = axios.create({
  baseURL: config.meli.baseUrl,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
  },
});

export async function searchOrders(params) {
  requireEnv(['MELI_ACCESS_TOKEN', 'MELI_SELLER_ID']);

  if (shouldRefreshMeliToken()) {
    await refreshMeliAccessToken();
  }

  const response = await withRetry(
    async () => {
      try {
        return await client.get('/orders/search', {
          params,
          headers: {
            Authorization: `Bearer ${getMeliAccessToken()}`,
          },
        });
      } catch (error) {
        if (error.response?.status !== 401) {
          throw error;
        }

        await refreshMeliAccessToken();
        return client.get('/orders/search', {
          params,
          headers: {
            Authorization: `Bearer ${getMeliAccessToken()}`,
          },
        });
      }
    },
    { retries: config.meli.maxRetries },
  );

  return response.data;
}
