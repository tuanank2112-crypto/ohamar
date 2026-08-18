// crm-feed.mjs — fan-out sự kiện lead-core sang CRM để hiển thị.
// FIRE-AND-FORGET: không chặn / không ném lỗi vào luồng request.
// Đọc env tại thời điểm GỌI (lazy) để tránh bug const rỗng khi .env nạp sau import.
function feedCfg() {
    const CRM_URL = (process.env.CRM_FEED_URL || "").replace(/\/$/, "");
    const FEED_TOKEN = (process.env.OHAMAR_FEED_TOKEN || "").trim();
    return { CRM_URL, FEED_TOKEN };
}

export function crmFeedEnabled() {
    const { CRM_URL, FEED_TOKEN } = feedCfg();
    return Boolean(CRM_URL && FEED_TOKEN);
}

export function feedToCrm(payload) {
    const { CRM_URL, FEED_TOKEN } = feedCfg();
    if (!CRM_URL || !FEED_TOKEN) {
        console.warn("[lead-core] crm-feed SKIP: thiếu CRM_FEED_URL/OHAMAR_FEED_TOKEN trong env process");
        return;
    }
    fetch(`${CRM_URL}/api/v1/ohamar/ingest`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${FEED_TOKEN}`,
        },
        body: JSON.stringify(payload),
    })
        .then(async (r) => {
            if (!r.ok) {
                const t = await r.text().catch(() => "");
                console.warn(`[lead-core] crm-feed ${r.status}: ${t.slice(0, 200)}`);
            } else {
                console.log(`[lead-core] crm-feed OK → thread=${payload?.thread_id ?? "?"} dir=${payload?.direction ?? "?"}`);
            }
        })
        .catch((e) =>
            console.warn(`[lead-core] crm-feed error: ${e instanceof Error ? e.message : e}`),
        );
}
