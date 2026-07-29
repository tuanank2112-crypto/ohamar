import { describe, expect, it } from 'vitest';
import { generateWithOpenaiCompat, parseOpenaiCompatContent } from '../src/modules/ai/providers/openai-compat.js';

describe('openai compat provider parser', () => {
  it('parses normal JSON chat completion', () => {
    const raw = JSON.stringify({ choices: [{ message: { content: ' xin chào ' } }] });
    expect(parseOpenaiCompatContent(raw)).toBe('xin chào');
  });

  it('parses SSE chat completion chunks', () => {
    const raw = [
      'event: message',
      'data: {"choices":[{"delta":{"content":"xin "}}]}',
      '',
      ' data: {"choices":[{"delta":{"content":"chào"}}]}',
      'data: [DONE]',
    ].join('\n');
    expect(parseOpenaiCompatContent(raw)).toBe('xin chào');
  });

  it('rejects truncated completions instead of returning partial content', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Dạ để tư vấn chính xác nhất, anh cho em hỏi mình đang tìm hiểu sản phẩm với vai trò là bác' }, finish_reason: 'length' }],
    }), { status: 200 })) as typeof fetch;

    try {
      await expect(generateWithOpenaiCompat('https://example.invalid/chat', 'key', 'model', 'system', 'prompt', 700))
        .rejects.toThrow('OpenAI-compat hit MAX_TOKENS');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
