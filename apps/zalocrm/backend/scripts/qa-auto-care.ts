// QA runner: chạy tay cron Auto-Care + sinh nhật, KHÔNG cần rebuild container.
// Dùng dry-run (không gửi Zalo). Bỏ qua khung giờ 6-22h khi AUTO_CARE_IGNORE_WINDOW=1.
//   AUTO_CARE_DRY_RUN=1 AUTO_CARE_IGNORE_WINDOW=1 npx tsx scripts/qa-auto-care.ts
import { runAutoCareOnce } from '../src/modules/auto-care/auto-care-cron.js';
import { runBirthdayOnce } from '../src/modules/auto-care/birthday-cron.js';
import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  console.log('DRY_RUN=%s IGNORE_WINDOW=%s', process.env.AUTO_CARE_DRY_RUN, process.env.AUTO_CARE_IGNORE_WINDOW);
  console.log('--- follow-up 24h ---');
  console.log(await runAutoCareOnce(null));
  console.log('--- birthday ---');
  console.log(await runBirthdayOnce(null));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
