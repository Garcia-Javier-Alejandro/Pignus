export function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(status, message, details) {
  return json({ error: message, details }, { status });
}

export async function requireAdmin(request, env) {
  if (!env.ADMIN_API_KEY) {
    return;
  }

  const expected = `Bearer ${env.ADMIN_API_KEY}`;
  const actual = request.headers.get('authorization');

  if (actual !== expected) {
    return errorResponse(401, 'Unauthorized');
  }
}
