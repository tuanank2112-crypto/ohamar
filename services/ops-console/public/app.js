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
let state = { threads: [], selected: null, detail: null, config: null };

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
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderList() {
  const el = $("#thread-list");
  if (!state.threads.length) {
    el.innerHTML = `<div class="empty">Chưa có hội thoại</div>`;
    return;
  }
  el.innerHTML = state.threads
    .map((t) => {
      const active = state.selected === t.id ? "active" : "";
      const timer =
        t.ai_mode === "human_paused" && t.resume_in_sec != null
          ? `AI lại sau ${t.resume_in_sec}s`
          : t.ai_mode === "human_pinned"
            ? "Pin — không auto"
            : "AI đang trực";
      return `<div class="thread ${active}" data-id="${t.id}">
        <div class="name">${escapeHtml(t.peer_name)}</div>
        <div class="bot">${escapeHtml(t.bot_label)} · ${escapeHtml(t.bot)}</div>
        <div class="preview">${escapeHtml(t.last_preview || "")}</div>
        <div class="row">${modeBadge(t.ai_mode)}<span style="font-size:10px;color:var(--muted)">${timer}</span></div>
      </div>`;
    })
    .join("");
  el.querySelectorAll(".thread").forEach((n) => {
    n.onclick = () => selectThread(n.dataset.id);
  });
}

function renderChat() {
  const d = state.detail;
  const head = $("#chat-head");
  const msgs = $("#messages");
  const banner = $("#banner");
  const composer = $("#composer");
  if (!d) {
    head.innerHTML = `<div class="empty">Chọn hội thoại bên trái</div>`;
    msgs.innerHTML = "";
    banner.innerHTML = "";
    composer.style.display = "none";
    return;
  }
  const t = d.thread;
  head.innerHTML = `
    <div>
      <h3>${escapeHtml(t.peer_name)}</h3>
      <div class="sub">${escapeHtml(t.bot_label)} · thread ${escapeHtml(t.thread_id)}</div>
    </div>
    <div class="toolbar">
      <button class="warn" id="btn-takeover" ${t.ai_mode !== "ai_active" ? "disabled" : ""}>Tiếp quản</button>
      <button class="danger" id="btn-pin">Pin human</button>
      <button class="ok" id="btn-resume" ${t.ai_mode === "ai_active" ? "disabled" : ""}>Trả lại AI</button>
      <button class="ghost" id="btn-sim">Giả lập khách nhắn</button>
    </div>`;

  if (t.ai_mode === "human_pinned") {
    banner.className = "banner pinned";
    banner.textContent =
      "Human PIN — AI tắt hẳn đến khi sale bấm «Trả lại AI». Không auto-resume.";
  } else if (t.ai_mode === "human_paused") {
    banner.className = "banner paused";
    banner.textContent = `Sale đang xử lý — AI tạm tắt. Tự bật lại sau ~${t.resume_in_sec ?? "?"}s không có tin (demo idle ${state.config?.idle_label || ""}).`;
  } else {
    banner.className = "banner ai";
    banner.textContent = "AI-first đang active. Gửi tin sale sẽ tự pause AI.";
  }

  msgs.innerHTML = d.messages
    .map((m) => {
      const who =
        m.role === "customer" ? "Khách" : m.role === "sale" ? "Sale (bot nick)" : "AI";
      return `<div class="bubble ${m.role}">
        <div class="who">${who}</div>
        <div>${escapeHtml(m.text)}</div>
        <div class="time">${fmtTime(m.at)}${m.delivery === "demo_local" ? " · demo local" : ""}</div>
      </div>`;
    })
    .join("");
  msgs.scrollTop = msgs.scrollHeight;
  composer.style.display = "flex";

  $("#btn-takeover").onclick = async () => {
    await api(`/v1/threads/${t.id}/takeover`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await refreshDetail();
    await refreshList();
  };
  $("#btn-pin").onclick = async () => {
    await api(`/v1/threads/${t.id}/pin`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await refreshDetail();
    await refreshList();
  };
  $("#btn-resume").onclick = async () => {
    await api(`/v1/threads/${t.id}/resume`, {
      method: "POST",
      body: JSON.stringify({ actor: "sale-demo" }),
    });
    await refreshDetail();
    await refreshList();
  };
  $("#btn-sim").onclick = async () => {
    const text = prompt("Tin khách (demo):", "Cho chị hỏi thêm về liệu trình ạ");
    if (text == null) return;
    await api(`/v1/threads/${t.id}/sim-customer`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await refreshDetail();
    await refreshList();
  };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  $("#idle-label").textContent = data.config?.idle_label || "";
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
  const el = $("#events");
  el.innerHTML = data.events
    .slice(0, 40)
    .map(
      (e) => `<div class="event">
        <div><strong>${escapeHtml(e.type)}</strong> · ${escapeHtml(e.actor)}</div>
        <div class="t">${fmtTime(e.at)}</div>
      </div>`,
    )
    .join("") || `<div class="empty">Chưa có event</div>`;
}

async function sendSale() {
  const text = $("#msg-input").value.trim();
  if (!text || !state.selected) return;
  await api(`/v1/threads/${state.selected}/send`, {
    method: "POST",
    body: JSON.stringify({ text, actor: "sale-demo" }),
  });
  $("#msg-input").value = "";
  await refreshDetail();
  await refreshList();
  await refreshEvents();
}

$("#btn-send").onclick = () => sendSale().catch(alert);
$("#msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendSale().catch(alert);
  }
});
$("#btn-reset").onclick = async () => {
  if (!confirm("Reset demo data?")) return;
  await api("/v1/demo/reset", { method: "POST", body: "{}" });
  state.selected = null;
  await boot();
};
$("#btn-refresh").onclick = () => boot().catch(alert);

async function boot() {
  await refreshList();
  await refreshDetail();
  await refreshEvents();
}

boot().catch((e) => {
  $("#thread-list").innerHTML = `<div class="empty">Lỗi: ${escapeHtml(e.message)}</div>`;
});

// poll for auto-resume countdown
setInterval(() => {
  refreshList().catch(() => {});
  if (state.selected) refreshDetail().catch(() => {});
  refreshEvents().catch(() => {});
}, 3000);
