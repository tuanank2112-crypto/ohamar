<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { opsApi } from "./api.js";

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
const messagesEl = ref(null);

let pollTimer = null;

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

async function loadList() {
  const data = await opsApi.threads();
  threads.value = data.threads;
  config.value = data.config;
}
async function loadDetail() {
  if (!selectedId.value) {
    detail.value = null;
    return;
  }
  detail.value = await opsApi.thread(selectedId.value);
  await nextTick();
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
}
async function loadEvents() {
  const data = await opsApi.events();
  events.value = data.events || [];
}
async function refreshAll() {
  try {
    error.value = "";
    await Promise.all([loadList(), loadDetail(), loadEvents()]);
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function selectThread(id) {
  selectedId.value = id;
  await loadDetail();
}

async function act(fn) {
  if (!selectedId.value || busy.value) return;
  busy.value = true;
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
  return act(() => opsApi.takeover(selectedId.value, { actor: "sale-demo" }));
}
function pin() {
  return act(() => opsApi.pin(selectedId.value, { actor: "sale-demo" }));
}
function resume() {
  return act(() => opsApi.resume(selectedId.value, { actor: "sale-demo" }));
}
function simCustomer() {
  const text = prompt("Tin khách (demo):", "Cho chị hỏi thêm về liệu trình ạ");
  if (text == null) return;
  return act(() => opsApi.simCustomer(selectedId.value, text));
}
async function send() {
  const text = draft.value.trim();
  if (!text) return;
  await act(async () => {
    await opsApi.send(selectedId.value, text, "sale-demo");
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
  await opsApi.reset();
  selectedId.value = null;
  await refreshAll();
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

onMounted(async () => {
  await refreshAll();
  pollTimer = setInterval(refreshAll, 3000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
watch(selectedId, () => loadDetail());
</script>

<template>
  <div class="mc-app-shell">
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
          <span>Không gian làm việc</span>
          <strong>Vicamed</strong>
        </div>
      </div>

      <nav class="mc-nav">
        <div class="mc-nav-group__title">Làm việc</div>
        <div class="mc-nav-item active">Inbox ops</div>
        <div class="mc-nav-item" style="opacity: 0.4">Contacts</div>
        <div class="mc-nav-item" style="opacity: 0.4">Analytics</div>
        <div class="mc-nav-group__title">Bot Zalo</div>
        <div class="mc-nav-item" style="opacity: 0.55">Gia Huy · Minh Phát</div>
      </nav>

      <div class="mc-sidebar__footer">
        <p>
          UI bám token Monarch (source CRM). Backend demo:
          takeover / pin / auto-resume. Gửi tin chưa ra Zalo thật.
        </p>
        <button type="button" class="ops-btn ops-btn-ghost" style="width: 100%" @click="resetDemo">
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
        <div class="mc-pill">Idle: {{ config?.idle_label || "…" }}</div>
        <button type="button" class="ops-btn ops-btn-ghost" @click="refreshAll">Làm mới</button>
      </header>

      <p v-if="error" class="ops-status pinned" style="margin: 10px 16px 0">{{ error }}</p>

      <div class="ops-chat-grid">
        <!-- COL: conversations -->
        <section class="ops-conv-col">
          <div class="ops-top-filter">
            <div class="ops-search">
              <input v-model="search" type="search" placeholder="Tìm tên, nội dung…" />
            </div>
            <div class="ops-chips">
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'all' }"
                @click="botFilter = 'all'"
              >
                Tất cả nick
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'main' }"
                @click="botFilter = 'main'"
              >
                Gia Huy
              </button>
              <button
                type="button"
                class="ops-chip"
                :class="{ active: botFilter === 'worker' }"
                @click="botFilter = 'worker'"
              >
                Minh Phát
              </button>
            </div>
          </div>

          <div class="ops-conv-list">
            <div v-if="!filtered.length" class="ops-empty">Không có hội thoại</div>
            <button
              v-for="t in filtered"
              :key="t.id"
              type="button"
              class="ops-conv"
              :class="{ active: selectedId === t.id }"
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
        <section class="ops-msg-col">
          <div v-if="!thread" class="ops-msg-empty">
            <h3>Chọn hội thoại</h3>
            <p>Layout bám inbox CRM · AI-first · Sale takeover trên nick bot.</p>
          </div>
          <template v-else>
            <div class="ops-msg-head">
              <div>
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
                  Tiếp quản
                </button>
                <button type="button" class="ops-btn ops-btn-danger" :disabled="busy" @click="pin">
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

            <div class="ops-status" :class="modeClass(thread.ai_mode)">{{ statusText }}</div>

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
                  v-model="draft"
                  rows="2"
                  placeholder="Sale nhắn bằng nick bot…"
                  @keydown="onKey"
                />
                <div class="ops-composer-hint">
                  Enter gửi · Shift+Enter xuống dòng · Gửi khi AI active = tự pause
                </div>
              </div>
              <button type="button" class="ops-btn-primary" :disabled="busy || !draft.trim()" @click="send">
                Gửi
              </button>
            </div>
          </template>
        </section>

        <!-- COL: activity -->
        <aside class="ops-rail">
          <div class="ops-rail__head">
            <h2>Hoạt động</h2>
            <p>Takeover, pin, auto-resume, tin sale — giống activity rail CRM.</p>
          </div>
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
  </div>
</template>
