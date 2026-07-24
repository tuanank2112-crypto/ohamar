async function request(path, opts = {}) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export const opsApi = {
  health: () => request("/v1/health"),
  threads: () => request("/v1/threads"),
  thread: (id) => request(`/v1/threads/${id}`),
  takeover: (id, body = {}) =>
    request(`/v1/threads/${id}/takeover`, { method: "POST", body: JSON.stringify(body) }),
  pin: (id, body = {}) =>
    request(`/v1/threads/${id}/pin`, { method: "POST", body: JSON.stringify(body) }),
  resume: (id, body = {}) =>
    request(`/v1/threads/${id}/resume`, { method: "POST", body: JSON.stringify(body) }),
  send: (id, text, actor = "sale-demo") =>
    request(`/v1/threads/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ text, actor }),
    }),
  simCustomer: (id, text) =>
    request(`/v1/threads/${id}/sim-customer`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  events: () => request("/v1/events"),
  reset: () => request("/v1/demo/reset", { method: "POST", body: "{}" }),
};
