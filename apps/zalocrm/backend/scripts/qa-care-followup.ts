// QA: verify care-followup đọc 10 tin gần nhất → soạn câu tư vấn tiếp.
// Gọi generateCareFollowupMessage THẬT (không gửi). In context 10 tin + output AI.
import { prisma } from '../src/shared/database/prisma-client.js';
import { withTenant } from '../src/shared/tenant/tenant-context.js';
import { generateCareFollowupMessage } from '../src/modules/ai/ai-service.js';

const ORG = '21ea90f8-6939-4648-863f-9322ed8d4422';
const CONV = process.env.CONV || 'e475825c-ddf9-4e59-a4a9-cd21d06ae87e';

async function main() {
  await withTenant(ORG, async () => {
    const msgs = await prisma.message.findMany({
      where: { conversationId: CONV, isDeleted: false },
      orderBy: { sentAt: 'desc' }, take: 10,
      select: { senderType: true, senderName: true, content: true, sentAt: true },
    });
    console.log(`--- 10 tin gần nhất (${msgs.length}) ---`);
    for (const m of [...msgs].reverse()) {
      const who = m.senderType === 'self' ? 'staff' : (m.senderName || 'customer');
      console.log(`[${who}] ${(m.content || '(empty)').slice(0, 80)}`);
    }
    console.log('--- AI soạn câu tư vấn tiếp ---');
    const out = await generateCareFollowupMessage({ orgId: ORG, conversationId: CONV, catalogContext: '' });
    console.log(out ?? '(null — AI tắt/thiếu key/rỗng)');
  });
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
