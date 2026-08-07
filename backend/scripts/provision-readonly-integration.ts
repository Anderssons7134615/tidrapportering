import { prisma } from '../src/lib/prisma.js';
import { parseProvisionKey, prepareIntegrationProvision } from '../src/lib/integrationProvision.js';

const MAX_STDIN_BYTES = 256;

async function readProvisionKey(): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      throw new Error('INTEGRATION_KEY_STDIN_INVALID');
    }
    chunks.push(bytes);
  }

  return parseProvisionKey(Buffer.concat(chunks));
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    throw new Error('INTEGRATION_KEY_STDIN_REQUIRED');
  }
  if (process.env.TIDAPP_READ_API_KEY) {
    throw new Error('INTEGRATION_KEY_ENV_FORBIDDEN');
  }

  const key = await readProvisionKey();
  const companies = await prisma.company.findMany({
    select: { id: true },
    take: 2,
  });
  const provision = prepareIntegrationProvision({
    key,
    companyIds: companies.map((company) => company.id),
  });
  const existingKey = await prisma.integrationAccessKey.findFirst({
    where: { name: provision.name },
    select: { companyId: true, keyHash: true, active: true },
  });

  if (existingKey) {
    if (
      existingKey.companyId === provision.companyId
      && existingKey.keyHash === provision.keyHash
      && existingKey.active
    ) {
      console.log('READONLY_INTEGRATION_PROVISIONED');
      return;
    }
    throw new Error('INTEGRATION_KEY_ALREADY_EXISTS');
  }

  await prisma.integrationAccessKey.create({ data: provision });
  console.log('READONLY_INTEGRATION_PROVISIONED');
}

try {
  await main();
} catch (error) {
  const code = error instanceof Error ? error.message : 'INTEGRATION_PROVISION_FAILED';
  console.error(code);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
