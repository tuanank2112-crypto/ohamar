<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { opsApi } from "./api.js";

const POLL_MS = Number(import.meta.env.VITE_OPS_POLL_MS || 3000);
/** Demo actor only — production must use server session, never trust client body. */
const DEMO_ACTOR = import.meta.env.VITE_OPS_DEMO_ACTOR || "sale-demo";

const threads = ref([]);
const config = ref(null);
const selectedId = ref(null);
const detail = ref(null);
const events = ref([]);
const botFilter = ref("all");
const search = ref("");
const draft = ref("");
const busy = ref(false);
const error = ref("");
const listError = ref("");
const detailError = ref("");
const eventsError = ref("");
const messagesEl = ref(null);
const forceScrollNext = ref(false);

let pollTimer = null;
let pollStopped = false;
let pollInFlight = false;

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return threads.value.filter((t) => {
    if (botFilter.value !== "all" && t.bot !== botFilter.value) return false;
    if (!q) return true;
    return (
      (t.peer_name || "").toLowerCase().includes(q) ||
      (t.last_preview || "").toLowerCase().includes(q) ||
      (t.bot_label || "").toLowerCase().includes(q)
    );
  });
});

const thread = computed(() => detail.value?.thread || null);
const messages = computed(() => detail.value?.messages || []);

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
function who(role) {
  if (role === "customer") return "Khách";
  if (role === "sale") return "Sale · nick bot";
  return "AI bot";
}

function isNearBottom(el, threshold = 80) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

async function maybeScrollToBottom(force = false) {
  await nextTick();
  const el = messagesEl.value;
  if (!el) return;
  if (force || forceScrollNext.value || isNearBottom(el)) {
    el.scrollTop = el.scrollHeight;
  }
  forceScrollNext.value = false;
}

async function loadList() {
  try {
    const data = await opsApi.threads();
    threads.value = data.threads;
    config.value = data.config;
    listError.value = "";
  } catch (e) {
    listError.value = e.message || String(e);
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
    // Stale response: user switched thread while request was in flight
    if (selectedId.value !== requestedId) return;
    detail.value = result;
    detailError.value = "";
    await maybeScrollToBottom(false);
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
  await Promise.allSettled([loadList(), loadDetail(), loadEvents()]);
}

/** Single source of truth: only set selectedId; watch loads detail once. */
function selectThread(id) {
  if (selectedId.value === id) return;
  selectedId.value = id;
  forceScrollNext.value = true;
}

async function act(fn, { requireThread = true } = {}) {
  if (requireThread && !selectedId.value) return;
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await refreshAll();
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    busy.value = false;
  }
}

function takeover() {
  return act(() => opsApi.takeover(selectedId.value, { actor: DEMO_ACTOR }));
}
function pin() {
  return act(() => opsApi.pin(selectedId.value, { actor: DEMO_ACTOR }));
}
function resume() {
  return act(() => opsApi.resume(selectedId.value, { actor: DEMO_ACTOR }));
}
function simCustomer() {
  const text = prompt("Tin khách (demo):", "Cho chị hỏi thêm về liệu trình ạ");
  if (text == null) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  return act(() => opsApi.simCustomer(selectedId.value, trimmed));
}
async function send() {
  const text = draft.value.trim();
  if (!text) return;
  forceScrollNext.value = true;
  await act(async () => {
    await opsApi.send(selectedId.value, text, DEMO_ACTOR);
    draft.value = "";
  });
}
function onKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}
async function resetDemo() {
  if (!confirm("Reset dữ liệu demo?")) return;
  await act(
    async () => {
      await opsApi.reset();
      selectedId.value = null;
      detail.value = null;
    },
    { requireThread: false },
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
    return "Human PIN — AI tat den khi sale bam Tra lai AI. Khong auto-resume.";
  }
  if (t.ai_mode === "human_paused") {
    return `Sale dang xu ly — AI tam tat. Tu bat lai sau ~${t.resume_in_sec ?? "?"}s khong co tin (${config.value?.idle_label || "idle"}).`;
  }
  return "AI-first dang active. Gui tin sale se tu pause AI tren thread nay.";
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
    }
  }
  if (!pollStopped) {
    pollTimer = setTimeout(pollLoop, POLL_MS);
  }
}

onMounted(async () => {
  pollStopped = false;
  await refreshAll();
  pollTimer = setTimeout(pollLoop, POLL_MS);
});
onUnmounted(() => {
  pollStopped = true;
  if (pollTimer) clearTimeout(pollTimer);
});

// Only watcher loads detail — selectThread must not also call loadDetail
watch(selectedId, () => {
  loadDetail();
});
</script>

<template>
  <div class="mc-app-shell" :class="{ 'thread-open': !!selectedId }">
    <aside class="mc-sidebar">
      <div class="mc-sidebar__brand">
        <div class="mc-brand-mark">O</div>
        <div class="mc-brand-copy">
          <strong>Ohamar</strong>
          <span>Monarch-style ops</span>
        </div>
      </div>

      <div class="mc-org-badge">
        <div class="mc-org-badge__avatar">V</div>
        <div>
          <span>Khong gian lam viec</span>
          <strong>Vicamed</strong>
        </div>
      </div>

      <nav class="mc-nav" aria-label="Menu chinh">
        <div class="mc-nav-group__title">Lam viec</div>
        <div class="mc-nav-item active" aria-current="page">Inbox ops</div>
        <div class="mc-nav-item" style="opacity: 0.4">Contacts</div>
        <div class="mc-nav-item" style="opacity: 0.4">Analytics</div>
        <div class="mc-nav-group__title">Bot Zalo</div>
        <div class="mc-nav-item" style="opacity: 0.55">Gia Huy · Minh Phat</div>
      </nav>

      <div class="mc-sidebar__footer">
        <p>
          Demo local · actor client chi de hien thi; production phai lay tu session server.
          Gui tin chua ra Zalo that.
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
          <span>Lam viec</span>
          <strong>Inbox · Sale takeover</strong>
        </div>
        <div class="mc-topbar__spacer" />
        <div class="mc-pill">Idle: {{ config?.idle_label || "…" }}</div>
        <button type="button" class="ops-btn ops-btn-ghost" :disabled="busy" @click="refreshAll">
          Lam moi
        </button>
      </header>

      <p v-if="error" class="ops-status pinned" style="margin: 10px 16px 0" role="alert">
        {{ error }}
      </p>

      <div class="ops-chat-grid">
        <!-- COL: conversations -->
        <section class="ops-conv-col" aria-label="Danh sach hoi thoai">
          <div class="ops-top-filter">
            <div class="ops-search">
              <input
                id="ops-search"
                v-model="search"
                type="search"
                placeholder="Tim ten, noi dung…"
                aria-label="Tim hoi thoai"
              />
            </div>
            <div class="ops-chips" role="group" aria-label="Loc nick bot">
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'all' }"
                :aria-pressed="botFilter === 'all'"
                @click="botFilter = 'all'"
              >
                Tat ca nick
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
                Minh Phat
              </button>
            </div>
            <p v-if="listError" class="ops-inline-err" role="alert">{{ listError }}</p>
          </div>

          <div class="ops-conv-list">
            <div v-if="!filtered.length" class="ops-empty">Khong co hoi thoai</div>
            <button
              v-for="t in filtered"
              :key="t.id"
              type="button"
              class="ops-conv"
              :class="{ active: selectedId === t.id }"
              :aria-current="selectedId === t.id ? 'true' : undefined"
              @click="selectThread(t.id)"
            >
              <div class="ops-conv__top">
                <div class="ops-conv__name">{{ t.peer_name }}</div>
                <div class="ops-conv__time">{{ fmtTime(t.last_activity_at) }}</div>
              </div>
              <div class="ops-conv__bot">
                <span class="ops-dot" :class="{ worker: t.bot === 'worker' }" />
                {{ t.bot_label }}
              </div>
              <div class="ops-conv__preview">{{ t.last_preview }}</div>
              <div class="ops-conv__foot">
                <span class="ops-badge" :class="modeClass(t.ai_mode)">{{ modeLabel(t.ai_mode) }}</span>
                <span style="font-size: 10.5px; color: var(--mc-muted)">
                  <template v-if="t.ai_mode === 'human_paused'">AI {{ t.resume_in_sec }}s</template>
                  <template v-else-if="t.ai_mode === 'human_pinned'">Pinned</template>
                </span>
              </div>
            </button>
          </div>
        </section>

        <!-- COL: messages -->
        <section class="ops-msg-col" aria-label="Noi dung chat">
          <div v-if="!thread" class="ops-msg-empty">
            <h3>Chon hoi thoai</h3>
            <p>Layout bam inbox CRM · AI-first · Sale takeover tren nick bot.</p>
          </div>
          <template v-else>
            <div class="ops-msg-head">
              <div>
                <button type="button" class="ops-back" @click="backToList">← Danh sach</button>
                <h3>{{ thread.peer_name }}</h3>
                <div class="sub">{{ thread.bot_label }} · {{ thread.thread_id }}</div>
              </div>
              <div class="ops-toolbar">
                <button
                  type="button"
                  class="ops-btn ops-btn-warn"
                  :disabled="busy || thread.ai_mode !== 'ai_active'"
                  @click="takeover"
                >
                  Tiep quan
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
                  Tra lai AI
                </button>
                <button type="button" class="ops-btn" :disabled="busy" @click="simCustomer">
                  Gia lap khach
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
              <div v-for="m in messages" :key="m.id" class="ops-bubble" :class="m.role">
                <div class="who">{{ who(m.role) }}</div>
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
                  placeholder="Sale nhan bang nick bot…"
                  aria-label="Noi dung tin nhan sale"
                  @keydown="onKey"
                />
                <div class="ops-composer-hint">
                  Enter gui · Shift+Enter xuong dong · Gui khi AI active = tu pause
                </div>
              </div>
              <button
                type="button"
                class="ops-btn-primary"
                :disabled="busy || !draft.trim()"
                @click="send"
              >
                Gui
              </button>
            </div>
          </template>
        </section>

        <!-- COL: activity -->
        <aside class="ops-rail" aria-label="Hoat dong">
          <div class="ops-rail__head">
            <h2>Hoat dong</h2>
            <p>Takeover, pin, auto-resume, tin sale.</p>
          </div>
          <p v-if="eventsError" class="ops-inline-err" role="alert" style="margin: 8px 12px">
            {{ eventsError }}
          </p>
          <div class="ops-events">
            <div v-if="!events.length" class="ops-empty">Chua co su kien</div>
            <div v-for="e in events.slice(0, 50)" :key="e.id" class="ops-event">
              <strong>{{ e.type }}</strong>
              <span>{{ e.actor }} · {{ fmtTime(e.at) }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
