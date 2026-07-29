/**
 * Minimal Lead Core HTTP client (for scripts / gate / cron).
 *
 * P2: mỗi lời gọi có thể truyền token riêng để server xác thực ĐÚNG identity.
 * Mặc định dùng LEGACY_TOKEN cho tương thích ngược.
 */
import { HOST, LEGACY_TOKEN, PORT, tokenForCaller } from "./config.mjs";

const base = () => `${"http"}://${HOST}:${PORT}`;

export async function api(method, path, body, token = LEGACY_TOKEN) {
  const headers = {
    Authorization: `Bearer ${token}`,
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

export function ingestEvent(body, token) {
  return api("POST", "/v1/events", body, token);
}

export function claim(id, body, token) {
  return api("POST", `/v1/conversations/${id}/claim`, body, token);
}

export function outbound(id, body, token) {
  return api("POST", `/v1/conversations/${id}/outbound`, body, token);
}

export function handoff(body, token) {
  return api("POST", "/v1/handoffs", body, token);
}

export function consent(body, token) {
  return api("POST", "/v1/consents", body, token);
}

export function getConversation(id, token) {
  return api("GET", `/v1/conversations/${id}`, undefined, token);
}

export { tokenForCaller };