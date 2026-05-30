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
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Seed är blockerat i produktion. Sätt ALLOW_PRODUCTION_SEED=true om detta är avsiktligt.');
  }

  console.log('🌱 Seedar databas...');

  // Rensa befintlig data
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.weekLock.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.project.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.company.deleteMany();

  // === FÖRETAG 1: Anderssons Isolering ===
  const company1 = await prisma.company.create({
    data: {
      name: 'Anderssons Isolering',
      orgNumber: '556123-4567',
    },
  });

  await prisma.settings.create({
    data: {
      companyId: company1.id,
      companyName: 'Anderssons Isolering',
      vatRate: 25,
      weekStartDay: 1,
      csvDelimiter: ';',
      defaultCurrency: 'SEK',
      reminderTime: '15:30',
      reminderEnabled: true,
    },
  });

  const hashedPassword1 = await bcrypt.hash('Rick1234', 10);
  await prisma.user.create({
    data: {
      companyId: company1.id,
      email: 'rick@anderssonsisolering.se',
      password: hashedPassword1,
      name: 'Rick',
      role: 'ADMIN',
      hourlyCost: 450,
    },
  });

  // Skapa aktiviteter för företag 1
  await Promise.all(
    DEFAULT_ACTIVITIES.map((a) =>
      prisma.activity.create({
        data: { ...a, companyId: company1.id },
      })
    )
  );

  console.log('✅ Företag 1 (Anderssons Isolering) skapat');

  // === FÖRETAG 2: Testföretaget AB (demo) ===
  const company2 = await prisma.company.create({
    data: {
      name: 'Testföretaget AB',
      orgNumber: '556987-6543',
    },
  });

  await prisma.settings.create({
    data: {
      companyId: company2.id,
      companyName: 'Testföretaget AB',
      vatRate: 25,
      weekStartDay: 1,
      csvDelimiter: ';',
      defaultCurrency: 'SEK',
      reminderTime: '16:00',
      reminderEnabled: true,
    },
  });

  const hashedPassword2 = await bcrypt.hash('Test1234', 10);
  await prisma.user.create({
    data: {
      companyId: company2.id,
      email: 'admin@testforetaget.se',
      password: hashedPassword2,
      name: 'Test Admin',
      role: 'ADMIN',
      hourlyCost: 400,
    },
  });

  // Skapa aktiviteter för företag 2
  await Promise.all(
    DEFAULT_ACTIVITIES.map((a) =>
      prisma.activity.create({
        data: { ...a, companyId: company2.id },
      })
    )
  );

  console.log('✅ Företag 2 (Testföretaget AB) skapat');

  console.log('\n🎉 Databas seedning klar!');
  console.log('\n📧 Logga in med:');
  console.log('   Anderssons Isolering: rick@anderssonsisolering.se / Rick1234');
  console.log('   Testföretaget AB:     admin@testforetaget.se / Test1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
