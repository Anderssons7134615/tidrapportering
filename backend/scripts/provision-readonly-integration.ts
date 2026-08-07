import { prisma } from '../src/lib/prisma.js';
import { prepareIntegrationProvision } from '../src/lib/integrationProvision.js';

const key = process.env.TIDAPP_READ_API_KEY;

if (!key) {
  throw new Error('TIDAPP_READ_API_KEY_MISSING');
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
