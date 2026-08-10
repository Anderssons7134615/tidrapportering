import { prisma } from '../src/lib/prisma.js';
import { parseProvisionKey } from '../src/lib/integrationProvision.js';
import { prepareProjectIntegrationProvision } from '../src/lib/integrationProjectProvision.js';

const MAX_STDIN_BYTES = 256;
const INTEGRATION_COMPANY_NAME = 'Anderssons Isolering i Laholm AB';

async function readProvisionKey(): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > MAX_STDIN_BYTES) throw new Error('INTEGRATION_KEY_STDIN_INVALID');
    chunks.push(bytes);
  }
  return parseProvisionKey(Buffer.concat(chunks));
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) throw new Error('INTEGRATION_KEY_STDIN_REQUIRED');
  if (process.env.TIDAPP_PROJECT_CREATE_API_KEY) throw new Error('INTEGRATION_KEY_ENV_FORBIDDEN');
  const key = await readProvisionKey();
  const companies = await prisma.company.findMany({
    where: { name: INTEGRATION_COMPANY_NAME },
    select: { id: true },
    take: 2,
  });
  const provision = prepareProjectIntegrationProvision({ key, companyIds: companies.map((company) => company.id) });
  const existing = await prisma.integrationAccessKey.findFirst({
    where: { name: provision.name },
    select: { companyId: true, keyHash: true, active: true, permission: true },
  });
  if (existing) {
    if (
      existing.companyId === provision.companyId
      && existing.keyHash === provision.keyHash
      && existing.active
      && existing.permission === 'PROJECT_CREATE'
    ) {
      console.log('PROJECT_CREATE_INTEGRATION_PROVISIONED');
      return;
    }
    throw new Error('INTEGRATION_KEY_ALREADY_EXISTS');
  }
  await prisma.integrationAccessKey.create({ data: provision });
  console.log('PROJECT_CREATE_INTEGRATION_PROVISIONED');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'INTEGRATION_PROVISION_FAILED');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
