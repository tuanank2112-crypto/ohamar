// SPDX-License-Identifier: AGPL-3.0-or-later

const INJECTION_PATTERNS = [
  /ignore (all|any|the|previous) (instructions?|prompts?)/i,
  /bỏ qua (mọi|tất cả|các) (chỉ dẫn|hướng dẫn|quy tắc)/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /jailbreak/i,
  /reveal.*(secret|token|cookie|prompt)/i,
];

const MEDICAL_RISK_PATTERNS: Array<[string, RegExp]> = [
  ['diagnosis', /(chẩn đoán|tôi bị bệnh gì|bệnh gì|diagnos)/i],
  ['personalized_dosage', /(liều dùng|uống bao nhiêu|bôi bao nhiêu|kê đơn|toa thuốc)/i],
  ['adverse_event', /(phản ứng phụ|dị ứng|khó thở|sốc|sưng phù|chảy máu|ngất)/i],
  ['emergency', /(đau ngực|không thở được|co giật|tự tử|cấp cứu)/i],
  ['legal_or_complaint', /(khiếu nại|khởi kiện|pháp lý|lừa đảo|bồi thường)/i],
  ['human_requested', /(gặp người thật|nhân viên tư vấn|gặp bác sĩ|gọi cho tôi)/i],
];

export function reducePii(input: string): string {
  return input
    .replace(/\b(?:\+?84|0)(?:[35789]\d{8})\b/g, '[PHONE]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{9,12}\b/g, '[IDENTIFIER]');
}

export function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

export function detectRiskFlags(input: string): string[] {
  return MEDICAL_RISK_PATTERNS.filter(([, pattern]) => pattern.test(input)).map(([flag]) => flag);
}

export type PolicyInput = {
  mode: 'OFF' | 'ASSIST' | 'AUTO';
  threadType: string;
  contentType: string;
  similarity: number | null;
  threshold: number;
  citationCount: number;
  riskFlags: string[];
  promptInjection: boolean;
  handoffStatus: string;
  ragAvailable: boolean;
  allowContextFallback?: boolean;
  killSwitch: boolean;
  withinBudget: boolean;
};

export function decideRagPolicy(input: PolicyInput): { decision: 'blocked' | 'draft' | 'auto_send' | 'handoff'; reason: string } {
  if (input.mode === 'OFF') return { decision: 'blocked', reason: 'ai_mode_off' };
  if (input.handoffStatus === 'TAKEN') return { decision: 'blocked', reason: 'human_takeover_active' };
  if (input.promptInjection) return { decision: 'handoff', reason: 'prompt_injection' };
  if (input.riskFlags.length) return { decision: 'handoff', reason: input.riskFlags[0] };
  if (!input.ragAvailable) return { decision: 'handoff', reason: 'missing_ai_answer' };
  if (input.allowContextFallback) {
    // ponytail: context fallback skips knowledge-source gates; add per-intent allowlist if auto-reply needs stricter domains.
  } else if (!input.citationCount || input.similarity == null) {
    if (!input.allowContextFallback) return { decision: 'handoff', reason: 'missing_approved_source' };
  } else if (input.similarity < input.threshold) {
    return { decision: 'handoff', reason: 'similarity_below_threshold' };
  }
  if (input.mode === 'ASSIST') return { decision: 'draft', reason: 'assist_mode' };
  if (input.killSwitch) return { decision: 'draft', reason: 'organization_kill_switch' };
  if (!input.withinBudget) return { decision: 'draft', reason: 'daily_budget_exceeded' };
  if (input.threadType !== 'user' || input.contentType !== 'text') return { decision: 'draft', reason: 'unsupported_conversation_type' };
  return { decision: 'auto_send', reason: 'policy_passed' };
}
