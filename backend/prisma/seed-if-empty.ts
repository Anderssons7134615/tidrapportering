import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ACTIVITIES = [
  { name: 'Montage', code: 'MONT', category: 'WORK', billableDefault: true, sortOrder: 1 },
  { name: 'Rivning', code: 'RIV', category: 'WORK', billableDefault: true, sortOrder: 2 },
  { name: 'Installation', code: 'INST', category: 'WORK', billableDefault: true, sortOrder: 3 },
  { name: 'Isolering', code: 'ISOL', category: 'WORK', billableDefault: true, sortOrder: 4 },
  { name: 'Service', code: 'SERV', category: 'WORK', billableDefault: true, sortOrder: 5 },
  { name: 'ÄTA-arbete', code: 'ATA', category: 'CHANGE_ORDER', billableDefault: true, sortOrder: 6 },
  { name: 'Resa', code: 'RESA', category: 'TRAVEL', billableDefault: true, sortOrder: 10 },
  { name: 'Möte', code: 'MOTE', category: 'MEETING', billableDefault: true, sortOrder: 15 },
  { name: 'Byggmöte', code: 'BYGGM', category: 'MEETING', billableDefault: true, sortOrder: 16 },
  { name: 'Administration', code: 'ADM', category: 'INTERNAL', billableDefault: false, sortOrder: 20 },
  { name: 'Utbildning', code: 'UTB', category: 'INTERNAL', billableDefault: false, sortOrder: 21 },
  { name: 'Sjuk', code: 'SJUK', category: 'ABSENCE', billableDefault: false, sortOrder: 30 },
  { name: 'VAB', code: 'VAB', category: 'ABSENCE', billableDefault: false, sortOrder: 31 },
  { name: 'Semester', code: 'SEM', category: 'ABSENCE', billableDefault: false, sortOrder: 32 },
  { name: 'Övertid 50%', code: 'OT50', category: 'WORK', billableDefault: true, sortOrder: 40 },
  { name: 'Övertid 100%', code: 'OT100', category: 'WORK', billableDefault: true, sortOrder: 41 },
  { name: 'OB-tillägg', code: 'OB', category: 'WORK', billableDefault: true, sortOrder: 42 },
];

async function main() {
  // Kolla om det redan finns företag
  const companyCount = await prisma.company.count();

  if (companyCount > 0) {
    console.log('⏭️  Databas redan seedat (' + companyCount + ' företag finns). Hoppar över.');
    return;
  }

  console.log('🌱 Tom databas - seedar med standarddata...');

  // Skapa Anderssons Isolering
  const company = await prisma.company.create({
    data: {
      name: 'Anderssons Isolering',
      orgNumber: '556123-4567',
    },
  });

  await prisma.settings.create({
    data: {
      companyId: company.id,
      companyName: 'Anderssons Isolering',
      vatRate: 25,
      weekStartDay: 1,
      csvDelimiter: ';',
      defaultCurrency: 'SEK',
      reminderTime: '15:30',
      reminderEnabled: true,
    },
  });

  const hashedPassword = await bcrypt.hash('Rick1234', 10);
  await prisma.user.create({
    data: {
      companyId: company.id,
      email: 'rick@anderssonsisolering.se',
      password: hashedPassword,
      name: 'Rick',
      role: 'ADMIN',
      hourlyCost: 450,
    },
  });

  await Promise.all(
    DEFAULT_ACTIVITIES.map((a) =>
      prisma.activity.create({
        data: { ...a, companyId: company.id },
      })
    )
  );

  console.log('✅ Databas seedat med Anderssons Isolering');
  console.log('📧 Logga in: rick@anderssonsisolering.se / Rick1234');
}

main()
  .catch((e) => {
    console.error('Seed-fel:', e);
    // Fortsätt ändå - servern ska starta även om seed misslyckas
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
