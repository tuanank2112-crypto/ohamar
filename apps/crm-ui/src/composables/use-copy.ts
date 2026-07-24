// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

/**
 * Copy text to clipboard, reusable across the app.
 *
 * Ưu tiên Clipboard API (secure context: https / localhost). Khi bị chặn
 * (HTTP LAN, headless) rơi xuống fallback textarea + execCommand — deprecated
 * nhưng là đường duy nhất chạy được ngoài secure context, nên vẫn giữ.
 *
 * Trả về true nếu copy thành công, false nếu cả hai đường đều fail (khi đó
 * caller nên hiện hướng dẫn "bôi đen + Ctrl+C"). Không tự bung toast — caller
 * tự quyết message để giữ nguyên UX từng chỗ.
 */
export function useCopy() {
  async function copy(value: string | null | undefined): Promise<boolean> {
    if (!value) return false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch { /* clipboard bị chặn → rơi xuống fallback */ }
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      // eslint-disable-next-line deprecation/deprecation -- fallback cho non-secure context
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  return { copy };
}
