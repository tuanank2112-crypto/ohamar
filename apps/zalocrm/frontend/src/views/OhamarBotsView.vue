<template>
  <div class="ohamar-page">
    <header class="ohamar-head">
      <div>
        <div class="eyebrow">Ohamar · Phase bridge</div>
        <h1>2 bot Zalo (zaloclaw)</h1>
        <p class="sub">
          CRM giữ UI · Zalo + AI do Ohamar. Không bật zca-js CRM cùng nick bot.
        </p>
      </div>
      <div class="actions">
        <button class="btn" type="button" :disabled="loading" @click="refresh">Làm mới</button>
      </div>
    </header>

    <div v-if="statusError" class="banner err">{{ statusError }}</div>
    <div v-if="status && !status.enabled" class="banner warn">
      Bridge chưa bật: set <code>OHAMAR_BRIDGE_URL</code> trên CRM app.
    </div>

    <div class="grid">
      <section v-for="b in bots" :key="b.id" class="card">
        <div class="card-top">
          <div>
            <h2>{{ b.label || b.account_name || b.id }}</h2>
            <div class="meta">{{ b.id }} · port {{ b.port }} · channel {{ b.channel }}</div>
          </div>
          <span class="pill" :class="b.listening ? 'ok' : 'bad'">
            {{ b.listening ? 'Listening' : 'Offline' }}
          </span>
        </div>
        <ul class="facts">
          <li>Credentials: {{ b.credentials_present ? 'có' : 'thiếu' }}</li>
          <li>Host: {{ b.host }}</li>
          <li>OK: {{ b.ok ? 'yes' : 'no' }}</li>
        </ul>
      </section>
    </div>

    <section class="card wide">
      <h2>Gửi tin qua Ohamar (bridge)</h2>
      <div class="form">
        <label>
          Bot
          <select v-model="form.bot">
            <option value="main">main · Gia Huy</option>
            <option value="worker">worker · Minh Phát</option>
          </select>
        </label>
        <label>
          Target (uid / group id)
          <input v-model="form.target" placeholder="Zalo thread id" />
        </label>
        <label class="full">
          Nội dung
          <textarea v-model="form.text" rows="3" />
        </label>
        <label class="check">
          <input v-model="form.dry_run" type="checkbox" />
          Dry-run (không gửi Zalo thật)
        </label>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" :disabled="sending" @click="send">
          {{ sending ? 'Đang gửi…' : 'Gửi qua Ohamar' }}
        </button>
      </div>
      <pre v-if="sendResult" class="out">{{ sendResult }}</pre>
    </section>

    <section class="card wide">
      <h2>AI mode (takeover)</h2>
      <div class="form">
        <label>
          Bot
          <select v-model="modeForm.bot">
            <option value="main">main</option>
            <option value="worker">worker</option>
          </select>
        </label>
        <label>
          Thread id
          <input v-model="modeForm.thread_id" placeholder="cùng target khi gửi" />
        </label>
        <label>
          Mode
          <select v-model="modeForm.mode">
            <option value="ai_active">ai_active</option>
            <option value="human_paused">human_paused</option>
            <option value="human_pinned">human_pinned</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="btn" type="button" @click="setMode">Đặt AI mode</button>
        <button class="btn" type="button" @click="getMode">Đọc AI mode</button>
      </div>
      <pre v-if="modeResult" class="out">{{ modeResult }}</pre>
    </section>

    <section class="card wide">
      <h2>Bridge events</h2>
      <button class="btn" type="button" @click="loadEvents">Tải events</button>
      <pre v-if="eventsText" class="out">{{ eventsText }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/api';

type Bot = {
  id: string;
  label?: string;
  account_name?: string;
  host?: string;
  port?: number;
  listening?: boolean;
  credentials_present?: boolean;
  ok?: boolean;
  channel?: string;
};

const loading = ref(false);
const sending = ref(false);
const statusError = ref('');
const status = ref<{ enabled?: boolean } | null>(null);
const bots = ref<Bot[]>([]);
const sendResult = ref('');
const modeResult = ref('');
const eventsText = ref('');

const form = reactive({
  bot: 'main',
  target: '',
  text: '[CRM] test send qua Ohamar bridge',
  dry_run: true,
});

const modeForm = reactive({
  bot: 'main',
  thread_id: '',
  mode: 'human_paused',
});

async function refresh() {
  loading.value = true;
  statusError.value = '';
  try {
    const { data: s } = await api.get('/ohamar/status');
    status.value = s;
    bots.value = s?.bots?.bots || s?.bots || [];
    if (s?.enabled) {
      try {
        const { data: b } = await api.get('/ohamar/bots');
        bots.value = b?.bots || bots.value;
      } catch {
        /* status already has bots */
      }
    }
  } catch (e: any) {
    statusError.value = e?.response?.data?.error || e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function send() {
  sending.value = true;
  sendResult.value = '';
  try {
    const { data: r } = await api.post('/ohamar/send', { ...form });
    sendResult.value = JSON.stringify(r, null, 2);
  } catch (e: any) {
    sendResult.value = JSON.stringify(e?.response?.data || { error: e?.message }, null, 2);
  } finally {
    sending.value = false;
  }
}

async function setMode() {
  modeResult.value = '';
  try {
    const { data: r } = await api.post('/ohamar/ai-mode', {
      bot: modeForm.bot,
      thread_id: modeForm.thread_id || form.target,
      mode: modeForm.mode,
      actor: 'crm-ui',
    });
    modeResult.value = JSON.stringify(r, null, 2);
  } catch (e: any) {
    modeResult.value = JSON.stringify(e?.response?.data || { error: e?.message }, null, 2);
  }
}

async function getMode() {
  modeResult.value = '';
  try {
    const tid = modeForm.thread_id || form.target;
    const { data: r } = await api.get('/ohamar/ai-mode', {
      params: { bot: modeForm.bot, thread_id: tid },
    });
    modeResult.value = JSON.stringify(r, null, 2);
  } catch (e: any) {
    modeResult.value = JSON.stringify(e?.response?.data || { error: e?.message }, null, 2);
  }
}

async function loadEvents() {
  eventsText.value = '';
  try {
    const { data: r } = await api.get('/ohamar/events');
    eventsText.value = JSON.stringify(r, null, 2);
  } catch (e: any) {
    eventsText.value = JSON.stringify(e?.response?.data || { error: e?.message }, null, 2);
  }
}

onMounted(refresh);
</script>

<style scoped>
.ohamar-page {
  padding: 20px 22px 40px;
  max-width: 1100px;
  color: var(--mc-ink, #e8eaf6);
}
.ohamar-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--mc-muted, #9fa3c7);
}
h1 {
  margin: 4px 0;
  font-size: 22px;
}
.sub {
  margin: 6px 0 0;
  color: var(--mc-muted, #9fa3c7);
  font-size: 13px;
  max-width: 560px;
  line-height: 1.45;
}
.banner {
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
  font-size: 13px;
}
.banner.err {
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
}
.banner.warn {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.35);
  color: #fde68a;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.card {
  background: var(--mc-panel, #181729);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
}
.card.wide {
  margin-bottom: 12px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
h2 {
  margin: 0 0 10px;
  font-size: 15px;
}
.meta {
  font-size: 12px;
  color: var(--mc-muted, #9fa3c7);
  margin-top: 2px;
}
.pill {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  height: fit-content;
}
.pill.ok {
  background: rgba(52, 211, 153, 0.15);
  color: #6ee7b7;
}
.pill.bad {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}
.facts {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--mc-text, #c5c8e0);
}
.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--mc-muted, #9fa3c7);
}
.form label.full {
  grid-column: 1 / -1;
}
.form label.check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.form input,
.form select,
.form textarea {
  background: #0e0d1c;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e8eaf6;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #252440;
  color: #e8eaf6;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
}
.btn.primary {
  background: #6c7de8;
  border-color: transparent;
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.out {
  margin-top: 12px;
  background: #0e0d1c;
  border-radius: 8px;
  padding: 10px;
  font-size: 11px;
  overflow: auto;
  max-height: 240px;
}
@media (max-width: 720px) {
  .form {
    grid-template-columns: 1fr;
  }
}
</style>
