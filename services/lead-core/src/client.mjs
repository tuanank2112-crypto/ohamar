/**
 * Minimal Lead Core HTTP client (for scripts / gate / cron).
 */
import { HOST, PORT, TOKEN } from "./config.mjs";

const base = () => `http://${HOST}:${PORT}`;

export async function api(method, path, body) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json",
  };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${base()}${path}`, { method, headers, body: payload });
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(json.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function health() {
  const r = await fetch(`${base()}/v1/health`);
  return r.json();
}

export function ingestEvent(body) {
  return api("POST", "/v1/events", body);
}

export function claim(id, body) {
  return api("POST", `/v1/conversations/${id}/claim`, body);
}

export function outbound(id, body) {
  return api("POST", `/v1/conversations/${id}/outbound`, body);
}

export function handoff(body) {
  return api("POST", "/v1/handoffs", body);
}

export function consent(body) {
  return api("POST", "/v1/consents", body);
}

export function getConversation(id) {
  return api("GET", `/v1/conversations/${id}`);
}
