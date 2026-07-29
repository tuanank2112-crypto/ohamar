<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { opsApi } from "./api.js";

const POLL_MS = Number(import.meta.env.VITE_OPS_POLL_MS || 3000);
/** Demo only — production must use server session. */
const DEMO_ACTOR = import.meta.env.VITE_OPS_DEMO_ACTOR || "sale-demo";
const MAX_MSG = 2000;

const threads = ref([]);
const config = ref(null);
const selectedId = ref(null);
const detail = ref(null);
const events = ref([]);
const botFilter = ref("all");
/** all | dm | group */
const typeFilter = ref("all");
const search = ref("");
const draft = ref("");
const busy = ref(false);
const booting = ref(true);
const apiOnline = ref(false);
const error = ref("");
const listError = ref("");
const detailError = ref("");
const eventsError = ref("");
const toast = ref(null);
const messagesEl = ref(null);
const forceScrollNext = ref(false);

let pollTimer = null;
let pollStopped = false;
let pollInFlight = false;
let toastTimer = null;

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return threads.value
    .filter((t) => {
      if (botFilter.value !== "all" && t.bot !== botFilter.value) return false;
      const typ = t.thread_type || "dm";
      if (typeFilter.value === "dm" && typ !== "dm") return false;
      if (typeFilter.value === "group" && typ !== "group") return false;
      if (!q) return true;
      return (
        (t.peer_name || "").toLowerCase().includes(q) ||
        (t.list_preview || t.last_preview || "").toLowerCase().includes(q) ||
        (t.bot_label || "").toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => {
      // Zalo-ish: pinned first, then activity
      if (a.pinned_chat !== b.pinned_chat) return a.pinned_chat ? -1 : 1;
      return a.last_activity_at < b.last_activity_at ? 1 : -1;
    });
});

const thread = computed(() => detail.value?.thread || null);
const messages = computed(() => detail.value?.messages || []);

const stats = computed(() => {
  const all = threads.value;
  return {
    total: all.length,
    ai: all.filter((t) => t.ai_mode === "ai_active").length,
    paused: all.filter((t) => t.ai_mode === "human_paused").length,
    pinned: all.filter((t) => t.ai_mode === "human_pinned").length,
  };
});

const draftLen = computed(() => draft.value.length);
const canSend = computed(
  () => !busy.value && draft.value.trim().length > 0 && draftLen.value <= MAX_MSG,
);

function modeClass(mode) {
  if (mode === "human_pinned") return "pinned";
  if (mode === "human_paused") return "paused";
  return "ai";
}
function modeLabel(mode) {
  if (mode === "human_pinned") return "Human pin";
  if (mode === "human_paused") return "Sale takeover";
  return "AI active";
}
function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
function fmtRelative(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 45) return "vừa xong";
  if (sec < 3600) return `${Math.floor(sec / 60)} phút`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ`;
  return fmtTime(iso);
}
function who(m, threadObj) {
  if (m.role === "sale") return m.sender_name || "Sale · nick bot";
  if (m.role === "ai") return m.sender_name || "AI bot";
  // customer / member
  if (threadObj?.is_group || threadObj?.thread_type === "group") {
    return m.sender_name || "Thành viên";
  }
  return m.sender_name || threadObj?.peer_name || "Khách";
}
function initials(name) {
  const p = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function isGroup(t) {
  return t && (t.is_group || t.thread_type === "group");
}

function showToast(msg, kind = "ok") {
  toast.value = { msg, kind };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2800);
}

function isNearBottom(el, threshold = 80) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

async function maybeScrollToBottom() {
  await nextTick();
  const el = messagesEl.value;
  if (!el) return;
  if (forceScrollNext.value || isNearBottom(el)) {
    el.scrollTop = el.scrollHeight;
  }
  forceScrollNext.value = false;
}

async function checkHealth() {
  try {
    await opsApi.health();
    apiOnline.value = true;
  } catch {
    apiOnline.value = false;
  }
}

async function loadList() {
  try {
    const data = await opsApi.threads();
    threads.value = data.threads;
    config.value = data.config;
    listError.value = "";
    apiOnline.value = true;
  } catch (e) {
    listError.value = e.message || String(e);
    apiOnline.value = false;
  }
}

async function loadDetail() {
  const requestedId = selectedId.value;
  if (!requestedId) {
    detail.value = null;
    detailError.value = "";
    return;
  }
  try {
    const result = await opsApi.thread(requestedId);
    if (selectedId.value !== requestedId) return;
    detail.value = result;
    detailError.value = "";
    await maybeScrollToBottom();
  } catch (e) {
    if (selectedId.value !== requestedId) return;
    detailError.value = e.message || String(e);
  }
}

async function loadEvents() {
  try {
    const data = await opsApi.events();
    events.value = data.events || [];
    eventsError.value = "";
  } catch (e) {
    eventsError.value = e.message || String(e);
  }
}

async function refreshAll() {
  error.value = "";
  await Promise.allSettled([loadList(), loadDetail(), loadEvents(), checkHealth()]);
}

function selectThread(id) {
  if (selectedId.value === id) return;
  selectedId.value = id;
  forceScrollNext.value = true;
}

async function act(fn, { requireThread = true, successToast } = {}) {
  if (requireThread && !selectedId.value) return;
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await refreshAll();
    if (successToast) showToast(successToast, "ok");
  } catch (e) {
    error.value = e.message || String(e);
    showToast(error.value, "err");
  } finally {
    busy.value = false;
  }
}

function takeover() {
  return act(() => opsApi.takeover(selectedId.value, { actor: DEMO_ACTOR }), {
    successToast: "Đã tiếp quản — AI tạm tắt",
  });
}
function pin() {
  return act(() => opsApi.pin(selectedId.value, { actor: DEMO_ACTOR }), {
    successToast: "Pin human — AI không tự bật lại",
  });
}
function resume() {
  return act(() => opsApi.resume(selectedId.value, { actor: DEMO_ACTOR }), {
    successToast: "Đã trả lại AI",
  });
}
function simCustomer() {
  const t = thread.value;
  let sender_name;
  if (isGroup(t)) {
    const sn = prompt("Tên thành viên gửi (nhóm):", "Huyền");
    if (sn == null) return;
    sender_name = sn.trim() || "Thành viên";
  }
  const text = prompt(
    isGroup(t) ? "Nội dung tin trong nhóm:" : "Tin khách (demo):",
    isGroup(t) ? "@bot lịch live tối nay chốt chưa ạ?" : "Cho chị hỏi thêm về liệu trình ạ",
  );
  if (text == null) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  forceScrollNext.value = true;
  return act(
    () =>
      opsApi.simCustomer(selectedId.value, trimmed, sender_name
        ? { sender_name }
        : undefined),
    { successToast: isGroup(t) ? "Tin nhóm (demo)" : "Đã giả lập tin khách" },
  );
}
async function send() {
  const text = draft.value.trim();
  if (!text || text.length > MAX_MSG) return;
  forceScrollNext.value = true;
  await act(
    async () => {
      await opsApi.send(selectedId.value, text, DEMO_ACTOR);
      draft.value = "";
    },
    { successToast: "Đã gửi (demo local)" },
  );
}
function onKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}
async function resetDemo() {
  if (!confirm("Reset toàn bộ dữ liệu demo?")) return;
  await act(
    async () => {
      await opsApi.reset();
      selectedId.value = null;
      detail.value = null;
    },
    { requireThread: false, successToast: "Đã reset demo" },
  );
}
function backToList() {
  selectedId.value = null;
  detail.value = null;
}

const statusText = computed(() => {
  const t = thread.value;
  if (!t) return "";
  if (t.ai_mode === "human_pinned") {
    return "Human PIN — AI tắt đến khi sale bấm «Trả lại AI». Không auto-resume.";
  }
  if (t.ai_mode === "human_paused") {
    return `Sale đang xử lý — AI tạm tắt. Tự bật lại sau ~${t.resume_in_sec ?? "?"}s không có tin (${config.value?.idle_label || "idle"}).`;
  }
  return "AI-first đang active. Gửi tin sale sẽ tự pause AI trên thread này.";
});

async function pollLoop() {
  if (pollStopped) return;
  if (document.visibilityState === "hidden") {
    pollTimer = setTimeout(pollLoop, POLL_MS);
    return;
  }
  if (!pollInFlight) {
    pollInFlight = true;
    try {
      await refreshAll();
    } finally {
      pollInFlight = false;
      booting.value = false;
    }
  }
  if (!pollStopped) pollTimer = setTimeout(pollLoop, POLL_MS);
}

onMounted(async () => {
  pollStopped = false;
  await refreshAll();
  booting.value = false;
  pollTimer = setTimeout(pollLoop, POLL_MS);
});
onUnmounted(() => {
  pollStopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (toastTimer) clearTimeout(toastTimer);
});
watch(selectedId, () => {
  loadDetail();
});
</script>

<template>
  <div class="mc-app-shell" :class="{ 'thread-open': !!selectedId }">
    <aside class="mc-sidebar" aria-label="Sidebar">
      <div class="mc-sidebar__brand">
        <div class="mc-brand-mark">O</div>
        <div class="mc-brand-copy">
          <strong>Ohamar</strong>
          <span>Ops console · demo</span>
        </div>
      </div>

      <div class="mc-org-badge">
        <div class="mc-org-badge__avatar">V</div>
        <div>
          <span>Không gian làm việc</span>
          <strong>Vicamed</strong>
        </div>
      </div>

      <div class="ops-stats" aria-label="Thống kê nhanh">
        <div class="ops-stat">
          <strong>{{ stats.total }}</strong>
          <span>Thread</span>
        </div>
        <div class="ops-stat ai">
          <strong>{{ stats.ai }}</strong>
          <span>AI</span>
        </div>
        <div class="ops-stat paused">
          <strong>{{ stats.paused }}</strong>
          <span>Sale</span>
        </div>
        <div class="ops-stat pinned">
          <strong>{{ stats.pinned }}</strong>
          <span>Pin</span>
        </div>
      </div>

      <nav class="mc-nav" aria-label="Menu chính">
        <div class="mc-nav-group__title">Làm việc</div>
        <div class="mc-nav-item active" aria-current="page">Inbox ops</div>
        <div class="mc-nav-item muted">Contacts · sau</div>
        <div class="mc-nav-item muted">Analytics · sau</div>
        <div class="mc-nav-group__title">Bot Zalo</div>
        <div class="mc-nav-item muted">Gia Huy · Minh Phát</div>
      </nav>

      <div class="mc-sidebar__footer">
        <p>
          Frontend demo · API ops-console. Chưa map gateway Zalo. Actor client chỉ hiển thị —
          production lấy từ session server.
        </p>
        <button
          type="button"
          class="ops-btn ops-btn-ghost"
          style="width: 100%"
          :disabled="busy"
          @click="resetDemo"
        >
          Reset demo
        </button>
      </div>
    </aside>

    <div class="mc-workspace">
      <header class="mc-topbar">
        <div class="mc-topbar__context">
          <span>Làm việc</span>
          <strong>Inbox · Sale takeover</strong>
        </div>
        <div class="mc-topbar__spacer" />
        <div
          class="mc-pill"
          :class="apiOnline ? 'online' : 'offline'"
          :title="apiOnline ? 'API :18793 OK' : 'API offline — chạy npm run ops-console'"
        >
          <span class="pulse" />
          {{ apiOnline ? "API online" : "API offline" }}
        </div>
        <div class="mc-pill">Idle: {{ config?.idle_label || "…" }}</div>
        <button type="button" class="ops-btn ops-btn-ghost" :disabled="busy" @click="refreshAll">
          Làm mới
        </button>
      </header>

      <div v-if="booting" class="ops-boot">Đang kết nối API…</div>

      <p v-if="error" class="ops-status pinned" style="margin: 10px 16px 0" role="alert">
        {{ error }}
      </p>

      <div v-if="!apiOnline && !booting" class="ops-banner-offline" role="alert">
        Không kết nối được API <code>127.0.0.1:18793</code>. Mở terminal khác:
        <code>cd ~/ohamar && npm run ops-console</code>
      </div>

      <div class="ops-chat-grid">
        <section class="ops-conv-col" aria-label="Danh sách hội thoại">
          <div class="ops-top-filter">
            <div class="ops-search">
              <input
                id="ops-search"
                v-model="search"
                type="search"
                placeholder="Tìm tên, nội dung…"
                aria-label="Tìm hội thoại"
              />
            </div>
            <div class="ops-chips" role="group" aria-label="Loại hội thoại">
              <button
                type="button"
                class="ops-chip"
                :class="{ active: typeFilter === 'all' }"
                :aria-pressed="typeFilter === 'all'"
                @click="typeFilter = 'all'"
              >
                Tất cả
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: typeFilter === 'dm' }"
                :aria-pressed="typeFilter === 'dm'"
                @click="typeFilter = 'dm'"
              >
                Chat 1-1
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: typeFilter === 'group' }"
                :aria-pressed="typeFilter === 'group'"
                @click="typeFilter = 'group'"
              >
                Nhóm
              </button>
            </div>
            <div class="ops-chips" role="group" aria-label="Lọc nick bot">
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'all' }"
                :aria-pressed="botFilter === 'all'"
                @click="botFilter = 'all'"
              >
                Mọi nick
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'main' }"
                :aria-pressed="botFilter === 'main'"
                @click="botFilter = 'main'"
              >
                Gia Huy
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'worker' }"
                :aria-pressed="botFilter === 'worker'"
                @click="botFilter = 'worker'"
              >
                Minh Phát
              </button>
            </div>
            <p v-if="listError" class="ops-inline-err" role="alert">{{ listError }}</p>
          </div>

          <div class="ops-conv-list">
            <div v-if="!filtered.length" class="ops-empty">
              {{ search ? "Không khớp tìm kiếm" : "Chưa có hội thoại demo" }}
            </div>
            <button
              v-for="t in filtered"
              :key="t.id"
              type="button"
              class="ops-conv"
              :class="{
                active: selectedId === t.id,
                unread: t.unread > 0,
                pinned: t.pinned_chat,
              }"
              :aria-current="selectedId === t.id ? 'true' : undefined"
              @click="selectThread(t.id)"
            >
              <div class="ops-conv__row">
                <div
                  class="ops-avatar"
                  :class="{ group: isGroup(t) }"
                  :data-bot="t.bot"
                >
                  <template v-if="isGroup(t)">👥</template>
                  <template v-else>{{ initials(t.peer_name) }}</template>
                </div>
                <div class="ops-conv__body">
                  <div class="ops-conv__top">
                    <div class="ops-conv__name">
                      <span v-if="t.pinned_chat" class="ops-pin" title="Ghim">📌</span>
                      {{ t.peer_name }}
                      <span v-if="isGroup(t)" class="ops-group-tag">Nhóm</span>
                    </div>
                    <div class="ops-conv__time">{{ fmtRelative(t.last_activity_at) }}</div>
                  </div>
                  <div class="ops-conv__bot">
                    <span class="ops-dot" :class="{ worker: t.bot === 'worker' }" />
                    {{ t.bot_label }}
                    <template v-if="isGroup(t)">
                      · {{ t.member_count || 0 }} thành viên
                    </template>
                  </div>
                  <div class="ops-conv__preview">{{ t.list_preview || t.last_preview }}</div>
                  <div class="ops-conv__foot">
                    <span class="ops-badge" :class="modeClass(t.ai_mode)">{{
                      modeLabel(t.ai_mode)
                    }}</span>
                    <span v-if="t.unread > 0" class="ops-unread">{{ t.unread }}</span>
                    <span v-else class="ops-meta">
                      <template v-if="t.ai_mode === 'human_paused'"
                        >AI {{ t.resume_in_sec }}s</template
                      >
                      <template v-else-if="t.ai_mode === 'human_pinned'">Pinned</template>
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="ops-msg-col" aria-label="Nội dung chat">
          <div v-if="!thread" class="ops-msg-empty">
            <div class="ops-msg-empty__icon">💬</div>
            <h3>Chọn hội thoại</h3>
            <p>
              AI-first · Sale tiếp quản trên nick bot · Pin human hoặc auto-resume sau idle.
            </p>
            <ol class="ops-howto">
              <li>Giả lập khách nhắn → AI demo trả lời</li>
              <li>Tiếp quản / gửi tin sale → AI pause</li>
              <li>Đợi idle hoặc bấm Trả lại AI</li>
            </ol>
          </div>
          <template v-else>
            <div class="ops-msg-head">
              <div class="ops-msg-head__left">
                <button type="button" class="ops-back" @click="backToList">← Danh sách</button>
                <div class="ops-msg-title-row">
                  <div
                    class="ops-avatar lg"
                    :class="{ group: isGroup(thread) }"
                    :data-bot="thread.bot"
                  >
                    <template v-if="isGroup(thread)">👥</template>
                    <template v-else>{{ initials(thread.peer_name) }}</template>
                  </div>
                  <div>
                    <h3>
                      {{ thread.peer_name }}
                      <span v-if="isGroup(thread)" class="ops-group-tag">Nhóm</span>
                    </h3>
                    <div class="sub">
                      <template v-if="isGroup(thread)"
                        >{{ thread.member_count }} thành viên · nick {{ thread.bot_label }}</template
                      >
                      <template v-else>Chat 1-1 · {{ thread.bot_label }}</template>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ops-toolbar">
                <button
                  type="button"
                  class="ops-btn ops-btn-warn"
                  :disabled="busy || thread.ai_mode !== 'ai_active'"
                  @click="takeover"
                >
                  Tiếp quản
                </button>
                <button
                  type="button"
                  class="ops-btn ops-btn-danger"
                  :disabled="busy || thread.ai_mode === 'human_pinned'"
                  @click="pin"
                >
                  Pin human
                </button>
                <button
                  type="button"
                  class="ops-btn ops-btn-ok"
                  :disabled="busy || thread.ai_mode === 'ai_active'"
                  @click="resume"
                >
                  Trả lại AI
                </button>
                <button type="button" class="ops-btn" :disabled="busy" @click="simCustomer">
                  Giả lập khách
                </button>
              </div>
            </div>

            <div class="ops-status" :class="modeClass(thread.ai_mode)" role="status">
              {{ statusText }}
            </div>
            <p v-if="detailError" class="ops-inline-err" role="alert" style="margin: 8px 16px 0">
              {{ detailError }}
            </p>

            <div ref="messagesEl" class="ops-messages">
              <div
                v-for="m in messages"
                :key="m.id"
                class="ops-bubble"
                :class="[m.role, { group: isGroup(thread) }]"
              >
                <div class="who">{{ who(m, thread) }}</div>
                <div>{{ m.text }}</div>
                <div class="time">
                  {{ fmtTime(m.at)
                  }}{{ m.delivery === "demo_local" ? " · demo local" : "" }}
                </div>
              </div>
            </div>

            <div class="ops-composer">
              <div class="ops-composer-box">
                <textarea
                  id="ops-draft"
                  v-model="draft"
                  rows="2"
                  :maxlength="MAX_MSG + 50"
                  placeholder="Sale nhắn bằng nick bot…"
                  aria-label="Nội dung tin nhắn sale"
                  @keydown="onKey"
                />
                <div class="ops-composer-bar">
                  <span class="ops-composer-hint"
                    >Enter gửi · Shift+Enter xuống dòng · Gửi khi AI active = tự pause</span
                  >
                  <span class="ops-composer-count" :class="{ over: draftLen > MAX_MSG }"
                    >{{ draftLen }}/{{ MAX_MSG }}</span
                  >
                </div>
              </div>
              <button type="button" class="ops-btn-primary" :disabled="!canSend" @click="send">
                {{ busy ? "…" : "Gửi" }}
              </button>
            </div>
          </template>
        </section>

        <aside class="ops-rail" aria-label="Hoạt động">
          <div class="ops-rail__head">
            <h2>Hoạt động</h2>
            <p>Takeover, pin, auto-resume, tin sale.</p>
          </div>
          <p v-if="eventsError" class="ops-inline-err" role="alert" style="margin: 8px 12px">
            {{ eventsError }}
          </p>
          <div class="ops-events">
            <div v-if="!events.length" class="ops-empty">Chưa có sự kiện</div>
            <div v-for="e in events.slice(0, 50)" :key="e.id" class="ops-event">
              <strong>{{ e.type }}</strong>
              <span>{{ e.actor }} · {{ fmtTime(e.at) }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div v-if="toast" class="ops-toast" :class="toast.kind" role="status">{{ toast.msg }}</div>
  </div>
</template>
