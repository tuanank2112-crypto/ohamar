const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_OPS_TIMEOUT_MS || 15000);

async function request(path, opts = {}) {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const hasBody = opts.body != null && opts.body !== "";
  const headers = { ...(opts.headers || {}) };
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const r = await fetch(path, {
      ...opts,
      headers,
      signal: opts.signal || controller.signal,
    });

    const raw = await r.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        if (!r.ok) throw new Error(raw.slice(0, 200) || r.statusText);
        data = { raw };
      }
    }

    if (!r.ok) {
      throw new Error(data.error || data.message || r.statusText || `HTTP ${r.status}`);
    }
    return data;
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Request timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function enc(id) {
  return encodeURIComponent(id);
}

export const opsApi = {
  health: () => request("/v1/health"),
  threads: () => request("/v1/threads"),
  thread: (id) => request(`/v1/threads/${enc(id)}`),
  takeover: (id, body = {}) =>
    request(`/v1/threads/${enc(id)}/takeover`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  pin: (id, body = {}) =>
    request(`/v1/threads/${enc(id)}/pin`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resume: (id, body = {}) =>
    request(`/v1/threads/${enc(id)}/resume`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  send: (id, text, actor = "sale-demo") =>
    request(`/v1/threads/${enc(id)}/send`, {
      method: "POST",
      body: JSON.stringify({ text, actor }),
    }),
  simCustomer: (id, text, extra = {}) =>
    request(`/v1/threads/${enc(id)}/sim-customer`, {
      method: "POST",
      body: JSON.stringify({ text, ...extra }),
    }),
  events: () => request("/v1/events"),
  reset: () => request("/v1/demo/reset", { method: "POST", body: "{}" }),
};
