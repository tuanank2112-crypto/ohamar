// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Shared handler for OpenAI-compatible chat/completions API.
 * Works with: OpenAI, Qwen (dashscope compat mode), Kimi (Moonshot).
 */
type ChatCompletionPayload = {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
    finish_reason?: string;
    finishReason?: string;
  }>;
};

type ParsedCompletion = { content: string; finishReasons: string[] };

function isMaxTokenFinish(reason: string): boolean {
  return ['length', 'max_tokens', 'MAX_TOKENS'].includes(reason);
}

function parseJsonContent(raw: string): ParsedCompletion {
  const data = JSON.parse(raw) as ChatCompletionPayload;
  return {
    content: data.choices?.[0]?.message?.content?.trim() || '',
    finishReasons: data.choices?.map((choice) => choice.finish_reason || choice.finishReason || '').filter(Boolean) || [],
  };
}

function parseSseContent(raw: string): ParsedCompletion {
  const finishReasons: string[] = [];
  const content = raw
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => {
      const data = JSON.parse(line) as ChatCompletionPayload;
      finishReasons.push(...(data.choices?.map((choice) => choice.finish_reason || choice.finishReason || '').filter(Boolean) || []));
      return data.choices?.map((choice) => choice.delta?.content || choice.message?.content || '').join('') || '';
    })
    .join('')
    .trim();
  return { content, finishReasons };
}

function parseOpenaiCompatResult(raw: string): ParsedCompletion {
  const body = raw.trim();
  if (!body) return { content: '', finishReasons: [] };
  return body.includes('data:') ? parseSseContent(body) : parseJsonContent(body);
}

export function parseOpenaiCompatContent(raw: string): string {
  return parseOpenaiCompatResult(raw).content;
}

export async function generateWithOpenaiCompat(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  maxTokens = 600,
  // OpenAI thế hệ mới (gpt-5.x / o-series) bỏ `max_tokens`, đòi `max_completion_tokens`.
  // Qwen/Kimi (compat mode cũ) vẫn dùng `max_tokens` → cho phép caller chọn tên tham số.
  tokenParam: 'max_tokens' | 'max_completion_tokens' = 'max_tokens',
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        [tokenParam]: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      throw new Error(`OpenAI-compat request failed with status ${status}`);
    }

    const { content: text, finishReasons } = parseOpenaiCompatResult(await response.text());
    if (!text) throw new Error('OpenAI-compat returned empty content');
    if (finishReasons.some(isMaxTokenFinish)) {
      console.warn(`OpenAI-compat reported MAX_TOKENS but returned content; using partial output (current=${maxTokens}, output len=${text.length})`);
    }
    if (!text && finishReasons.some(isMaxTokenFinish)) {
      throw new Error(`OpenAI-compat hit MAX_TOKENS — increase maxTokens (current=${maxTokens}, output len=${text.length})`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
