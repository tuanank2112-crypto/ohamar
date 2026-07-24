const api = (path, opts = {}) =>
  fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  });

const $ = (s) => document.querySelector(s);
const state = {
  threads: [],
  selected: null,
  detail: null,
  config: null,
  botFilter: "all",
  search: "",
};

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function modeBadge(mode) {
  if (mode === "human_pinned") return `<span class="badge pinned">Human pin</span>`;
  if (mode === "human_paused") return `<span class="badge paused">Sale takeover</span>`;
  return `<span class="badge ai">AI active</span>`;
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

function filteredThreads() {
  const q = state.search.trim().toLowerCase();
  return state.threads.filter((t) => {
    if (state.botFilter !== "all" && t.bot !== state.botFilter) return false;
    if (!q) return true;
    return (
      (t.peer_name || "").toLowerCase().includes(q) ||
      (t.last_preview || "").toLowerCase().includes(q) ||
      (t.bot_label || "").toLowerCase().includes(q)
    );
  });
}

function renderList() {
  const el = $("#thread-list");
  const list = filteredThreads();
  if (!list.length) {
    el.innerHTML = `<div class="empty-list">Không có hội thoại phù hợp</div>`;
    return;
  }
  el.innerHTML = list
    .map((t) => {
      const active = state.selected === t.id ? "active" : "";
      const timer =
        t.ai_mode === "human_paused" && t.resume_in_sec != null
          ? `AI ${t.resume_in_sec}s`
          : t.ai_mode === "human_pinned"
            ? "Pinned"
            : "";
      return `<button type="button" class="thread ${active}" data-id="${t.id}">
        <div class="thread-top">
          <div class="thread-name">${escapeHtml(t.peer_name)}</div>
          <div class="thread-time">${fmtTime(t.last_activity_at)}</div>
        </div>
        <div class="thread-bot">
          <span class="dot ${t.bot === "worker" ? "worker" : ""}"></span>
          ${escapeHtml(t.bot_label)}
        </div>
        <div class="thread-preview">${escapeHtml(t.last_preview || "")}</div>
        <div class="thread-foot">
          ${modeBadge(t.ai_mode)}
          <span style="font-size:10.5px;color:var(--mc-muted)">${timer}</span>
        </div>
      </button>`;
    })
    .join("");
  el.querySelectorAll(".thread").forEach((n) => {
    n.onclick = () => selectThread(n.dataset.id);
  });
}

function renderChat() {
  const empty = $("#thread-empty");
  const active = $("#thread-active");
  const d = state.detail;
  if (!d) {
    empty.style.display = "grid";
    active.style.display = "none";
    return;
  }
  empty.style.display = "none";
  active.style.display = "flex";

  const t = d.thread;
  $("#chat-title").textContent = t.peer_name;
  $("#chat-sub").textContent = `${t.bot_label} · ${t.thread_id}`;

  const bar = $("#status-bar");
  if (t.ai_mode === "human_pinned") {
    bar.className = "status-bar pinned";
    bar.textContent =
      "Human PIN — AI tắt đến khi sale bấm «Trả lại AI». Không tự bật lại.";
  } else if (t.ai_mode === "human_paused") {
    bar.className = "status-bar paused";
    bar.textContent = `Sale đang xử lý — AI tạm tắt. Tự bật lại sau ~${t.resume_in_sec ?? "?"}s không có tin mới (${state.config?.idle_label || "idle"}).`;
  } else {
    bar.className = "status-bar ai";
    bar.textContent = "AI-first đang active. Gửi tin sale sẽ tự pause AI trên thread này.";
  }

  $("#btn-takeover").disabled = t.ai_mode !== "ai_active";
  $("#btn-resume").disabled = t.ai_mode === "ai_active";

  const msgs = $("#messages");
  msgs.innerHTML = d.messages
    .map((m) => {
      const who =
        m.role === "customer" ? "Khách" : m.role === "sale" ? "Sale · nick bot" : "AI bot";
      return `<div class="bubble ${m.role}">
        <div class="who">${who}</div>
        <div>${escapeHtml(m.text)}</div>
        <div class="time">${fmtTime(m.at)}${m.delivery === "demo_local" ? " · demo local" : ""}</div>
      </div>`;
    })
    .join("");
  msgs.scrollTop = msgs.scrollHeight;
}

function renderEvents(events) {
  const el = $("#events");
  if (!events?.length) {
    el.innerHTML = `<div class="empty-list">Chưa có sự kiện</div>`;
    return;
  }
  el.innerHTML = events
    .slice(0, 50)
    .map(
      (e) => `<div class="event">
        <div class="event-type">${escapeHtml(e.type)}</div>
        <div class="event-meta">${escapeHtml(e.actor)} · ${fmtTime(e.at)}</div>
      </div>`,
    )
    .join("");
}

async function selectThread(id) {
  state.selected = id;
  await refreshDetail();
  renderList();
}

async function refreshList() {
  const data = await api("/v1/threads");
  state.threads = data.threads;
  state.config = data.config;
  $("#idle-label").textContent = data.config?.idle_label || "—";
  renderList();
}

async function refreshDetail() {
  if (!state.selected) {
    state.detail = null;
    renderChat();
    return;
  }
  state.detail = await api(`/v1/threads/${state.selected}`);
  renderChat();
}

async function refreshEvents() {
  const data = await api("/v1/events");
  renderEvents(data.events);
}

async function sendSale() {
  const text = $("#msg-input").value.trim();
  if (!text || !state.selected) return;
  await api(`/v1/threads/${state.selected}/send`, {
    method: "POST",
    body: JSON.stringify({ text, actor: "sale-demo" }),
  });
  $("#msg-input").value = "";
  await Promise.all([refreshDetail(), refreshList(), refreshEvents()]);
}

function bind() {
  $("#btn-send").onclick = () => sendSale().catch(alert);
  $("#msg-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendSale().catch(alert);
    }
  });
  $("#btn-takeover").onclick = async () => {
    await api(`/v1/threads/${state.selected}/takeover`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await Promise.all([refreshDetail(), refreshList(), refreshEvents()]);
  };
  $("#btn-pin").onclick = async () => {
    await api(`/v1/threads/${state.selected}/pin`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await Promise.all([refreshDetail(), refreshList(), refreshEvents()]);
  };
  $("#btn-resume").onclick = async () => {
    await api(`/v1/threads/${state.selected}/resume`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await Promise.all([refreshDetail(), refreshList(), refreshEvents()]);
  };
  $("#btn-sim").onclick = async () => {
    const text = prompt("Tin khách (demo):", "Cho chị hỏi thêm về liệu trình ạ");
    if (text == null) return;
    await api(`/v1/threads/${state.selected}/sim-customer`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await Promise.all([refreshDetail(), refreshList(), refreshEvents()]);
  };
  $("#btn-reset").onclick = async () => {
    if (!confirm("Reset dữ liệu demo?")) return;
    await api("/v1/demo/reset", { method: "POST", body: "{}" });
    state.selected = null;
    await boot();
  };
  $("#btn-refresh").onclick = () => boot().catch(alert);
  $("#search").oninput = (e) => {
    state.search = e.target.value;
    renderList();
  };
  document.querySelectorAll("#bot-tabs .chip").forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll("#bot-tabs .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.botFilter = chip.dataset.bot;
      renderList();
    };
  });
}

async function boot() {
  await refreshList();
  await refreshDetail();
  await refreshEvents();
}

bind();
boot().catch((e) => {
  $("#thread-list").innerHTML = `<div class="empty-list">Lỗi: ${escapeHtml(e.message)}</div>`;
});

setInterval(() => {
  refreshList().catch(() => {});
  if (state.selected) refreshDetail().catch(() => {});
  refreshEvents().catch(() => {});
}, 3000);
