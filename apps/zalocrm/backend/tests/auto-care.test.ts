// Unit test (thuần) — Auto-Care time helpers + build tin sinh nhật (2026-07-08).
// Phủ logic rủi ro: khung giờ gửi VN, MM-DD sinh nhật, render template + voucher.
// E2E (cron quét + gửi Zalo + dedup ActivityLog) → QA trên app thật (cần DB + nick).
import { describe, it, expect } from 'vitest';
import { vnHour, withinSendWindow, vnMonthDay, vnYear } from '../src/modules/auto-care/auto-care-time.js';
import { buildBirthdayMessage } from '../src/modules/auto-care/birthday-cron.js';

// 2026-01-15T02:30:00Z = 09:30 VN (UTC+7). 2026-01-14T20:00:00Z = 03:00 VN hôm sau.
const at = (iso: string) => new Date(iso);

describe('vnHour — giờ trong ngày theo giờ VN', () => {
  it('02:30Z → 9h VN', () => expect(vnHour(at('2026-01-15T02:30:00Z'))).toBe(9));
  it('20:00Z → 3h VN (qua ngày)', () => expect(vnHour(at('2026-01-14T20:00:00Z'))).toBe(3));
  it('17:00Z → 0h VN (nửa đêm)', () => expect(vnHour(at('2026-01-14T17:00:00Z'))).toBe(0));
});

describe('withinSendWindow — chỉ gửi 6-22h VN', () => {
  it('9h VN trong khung', () => expect(withinSendWindow(at('2026-01-15T02:30:00Z'), 6, 22)).toBe(true));
  it('3h VN ngoài khung (quá sớm)', () => expect(withinSendWindow(at('2026-01-14T20:00:00Z'), 6, 22)).toBe(false));
  it('22h VN ngoài khung (biên phải loại)', () => expect(withinSendWindow(at('2026-01-15T15:00:00Z'), 6, 22)).toBe(false));
  it('6h VN đúng biên trái', () => expect(withinSendWindow(at('2026-01-14T23:00:00Z'), 6, 22)).toBe(true));
});

describe('vnMonthDay / vnYear — so khớp + dedup sinh nhật theo giờ VN', () => {
  it('MM-DD theo giờ VN', () => expect(vnMonthDay(at('2026-07-08T05:00:00Z'))).toBe('07-08'));
  it('cận nửa đêm VN vẫn đúng ngày', () => {
    // 2026-07-08T17:30:00Z = 00:30 VN 09/07 → phải là 07-09.
    expect(vnMonthDay(at('2026-07-08T17:30:00Z'))).toBe('07-09');
  });
  it('năm theo giờ VN', () => expect(vnYear(at('2026-12-31T20:00:00Z'))).toBe(2027)); // 03:00 VN 01/01/2027
});

describe('buildBirthdayMessage — render template + chèn voucher', () => {
  const ctx = {
    contact: { id: 'c1', fullName: 'Anh Lộc', phone: '0900000000', status: 'interested' },
    org: { id: 'o1', name: 'HS Holding' },
  };
  it('template rỗng → mẫu mặc định + voucher', () => {
    const msg = buildBirthdayMessage(null, 'SN2026', ctx);
    expect(msg).toContain('Anh Lộc');
    expect(msg).toContain('HS Holding');
    expect(msg).toContain('SN2026');
  });
  it('template tự soạn với biến', () => {
    const msg = buildBirthdayMessage('Chúc {{contact.fullName}} sinh nhật vui!', 'GIFT10', ctx);
    expect(msg).toContain('Chúc Anh Lộc sinh nhật vui!');
    expect(msg).toContain('🎁');
    expect(msg).toContain('GIFT10');
  });
  it('không có voucher → không chèn dòng quà', () => {
    const msg = buildBirthdayMessage('Xin chào {{contact.fullName}}', null, ctx);
    expect(msg).toBe('Xin chào Anh Lộc');
    expect(msg).not.toContain('🎁');
  });
  it('voucher rỗng/space → bỏ qua', () => {
    expect(buildBirthdayMessage('Hi {{contact.fullName}}', '   ', ctx)).toBe('Hi Anh Lộc');
  });
});
