import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/appointment-reminders.test.ts',
      'tests/friend-serializer.test.ts',
      'tests/privacy-redact-regression.test.ts',
      'tests/ssrf-guard.test.ts',
      'tests/custom-report-sqli.test.ts',
      'tests/openai-compat-provider.test.ts',
      'tests/rag-v2-core.test.ts',
      'tests/media-dedup.test.ts',
      'tests/media-trash-gc.test.ts',
      'tests/care-manager-resolve.test.ts',
      'tests/contact-ghost-filter.test.ts',
      'tests/deleted-nick-*.test.ts',
      'tests/ghost-*.test.ts',
      'tests/manual-disconnect-needs-qr.test.ts',
      'tests/send-via-deleted-nick-blocked.test.ts',
      'tests/chat-operations-routes.test.ts',
      'tests/friend-routes.test.ts',
      'tests/friend-routes-all-nicks.test.ts',
      'tests/duplicate-detector-merge-policy.test.ts',
      'tests/auto-care.test.ts',
    ],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
    },
  },
});
