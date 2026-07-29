import { describe, expect, it } from 'vitest';
import { resolveCoolIcon } from './coolicons';

describe('coolicons adapter', () => {
  it('maps Material Design names', () => {
    expect(resolveCoolIcon('mdi-account-plus-outline')).toBe('User_Add');
    expect(resolveCoolIcon('mdi-calendar-clock')).toBe('Calendar_Event');
  });

  it('maps Lucide compatibility names', () => {
    expect(resolveCoolIcon('LayoutDashboard')).toBe('More_Grid_Big');
    expect(resolveCoolIcon('MessageSquareText')).toBe('Chat_Conversation');
  });

  it('maps former UI emoji without affecting arbitrary text', () => {
    expect(resolveCoolIcon('🔒')).toBe('Lock');
    expect(resolveCoolIcon('📅')).toBe('Calendar');
  });

  it('accepts official coolicons names directly', () => {
    expect(resolveCoolIcon('Search_Magnifying_Glass')).toBe('Search_Magnifying_Glass');
  });
});
