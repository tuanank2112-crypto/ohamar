// SPDX-License-Identifier: AGPL-3.0-or-later
import { Prisma } from '@prisma/client';
import { prisma } from '../shared/database/prisma-client.js';
import { encryptedSessionUpdate, isValidZaloCredentials } from '../modules/zalo/session-credentials.js';

async function main() {
  const accounts = await prisma.zaloAccount.findMany({
    where: { sessionCiphertext: null, sessionData: { not: Prisma.JsonNull } },
    select: { id: true, sessionData: true },
  });
  let migrated = 0;
  for (const account of accounts) {
    if (!isValidZaloCredentials(account.sessionData)) {
      console.warn(`skip invalid session: ${account.id}`);
      continue;
    }
    await prisma.zaloAccount.update({
      where: { id: account.id },
      data: encryptedSessionUpdate(account.sessionData),
    });
    migrated += 1;
  }
  console.log(`encrypted ${migrated}/${accounts.length} Zalo sessions`);
}

main().finally(() => prisma.$disconnect());
