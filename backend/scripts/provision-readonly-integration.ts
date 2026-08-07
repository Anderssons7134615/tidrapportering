import { prisma } from '../src/lib/prisma.js';
import { prepareIntegrationProvision } from '../src/lib/integrationProvision.js';

if (process.stdin.isTTY) {
  throw new Error('INTEGRATION_KEY_STDIN_REQUIRED');
}
if (process.env.TIDAPP_READ_API_KEY) {
  throw new Error('INTEGRATION_KEY_ENV_FORBIDDEN');
}

const key = await new Promise<string>((resolve, reject) => {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => { input += chunk; });
  process.stdin.on('end', () => resolve(input));
  process.stdin.on('error', reject);
});

if (!key || key.includes('\n') || key.includes('\r')) {
  throw new Error('INTEGRATION_KEY_STDIN_INVALID');
}

const existingKey = await prisma.integrationAccessKey.findFirst({
  where: { name: 'Hermes read-only adapter' },
  select: { id: true },
});
const companies = await prisma.company.findMany({
  select: { id: true },
  take: 2,
});
const provision = prepareIntegrationProvision({
  key,
  companyIds: companies.map((company) => company.id),
  existingKey: Boolean(existingKey),
});

await prisma.integrationAccessKey.create({ data: provision });
console.log('READONLY_INTEGRATION_PROVISIONED');
await prisma.$disconnect();
