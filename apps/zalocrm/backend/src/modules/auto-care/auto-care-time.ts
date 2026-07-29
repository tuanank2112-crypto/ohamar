// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * auto-care-time.ts — Pure time helpers (test được không cần DB).
 */

/** Giờ trong ngày (0-23) theo giờ VN của 1 thời điểm. */
export function vnHour(now: Date): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false,
  }).format(now);
  // '24' xảy ra ở 1 số môi trường cho nửa đêm → chuẩn hoá về 0.
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n;
}

/** true nếu giờ VN nằm trong [startHour, endHour) — khung được phép gửi. */
export function withinSendWindow(now: Date, startHour: number, endHour: number): boolean {
  const h = vnHour(now);
  return h >= startHour && h < endHour;
}

/** 'MM-DD' theo giờ VN — dùng so khớp sinh nhật (bỏ qua năm). */
export function vnMonthDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${mo}-${d}`;
}

/** Năm theo giờ VN — dùng dedup sinh nhật theo năm. */
export function vnYear(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now),
    10,
  );
}
