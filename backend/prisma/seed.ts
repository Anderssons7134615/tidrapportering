import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
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

  // Skapa företagsinställningar
  await prisma.settings.create({
    data: {
      companyName: 'Anderssons Isolering',
      vatRate: 25,
      weekStartDay: 1,
      csvDelimiter: ';',
      defaultCurrency: 'SEK',
      reminderTime: '15:30',
      reminderEnabled: true,
    },
  });

  // Skapa admin-användare
  const hashedPassword = await bcrypt.hash('Rick1234', 10);

  await prisma.user.create({
    data: {
      email: 'rick@anderssonsisolering.se',
      password: hashedPassword,
      name: 'Rick',
      role: 'ADMIN',
      hourlyCost: 450,
    },
  });

  console.log('✅ Admin-användare skapad');

  // Skapa aktiviteter
  await Promise.all([
    // Arbetsaktiviteter
    prisma.activity.create({
      data: { name: 'Montage', code: 'MONT', category: 'WORK', billableDefault: true, sortOrder: 1 },
    }),
    prisma.activity.create({
      data: { name: 'Rivning', code: 'RIV', category: 'WORK', billableDefault: true, sortOrder: 2 },
    }),
    prisma.activity.create({
      data: { name: 'Installation', code: 'INST', category: 'WORK', billableDefault: true, sortOrder: 3 },
    }),
    prisma.activity.create({
      data: { name: 'Isolering', code: 'ISOL', category: 'WORK', billableDefault: true, sortOrder: 4 },
    }),
    prisma.activity.create({
      data: { name: 'Service', code: 'SERV', category: 'WORK', billableDefault: true, sortOrder: 5 },
    }),
    prisma.activity.create({
      data: { name: 'ÄTA-arbete', code: 'ATA', category: 'CHANGE_ORDER', billableDefault: true, sortOrder: 6 },
    }),
    // Resa
    prisma.activity.create({
      data: { name: 'Resa', code: 'RESA', category: 'TRAVEL', billableDefault: true, sortOrder: 10 },
    }),
    // Möten
    prisma.activity.create({
      data: { name: 'Möte', code: 'MOTE', category: 'MEETING', billableDefault: true, sortOrder: 15 },
    }),
    prisma.activity.create({
      data: { name: 'Byggmöte', code: 'BYGGM', category: 'MEETING', billableDefault: true, sortOrder: 16 },
    }),
    // Intern tid
    prisma.activity.create({
      data: { name: 'Administration', code: 'ADM', category: 'INTERNAL', billableDefault: false, sortOrder: 20 },
    }),
    prisma.activity.create({
      data: { name: 'Utbildning', code: 'UTB', category: 'INTERNAL', billableDefault: false, sortOrder: 21 },
    }),
    // Frånvaro/lönearter
    prisma.activity.create({
      data: { name: 'Sjuk', code: 'SJUK', category: 'ABSENCE', billableDefault: false, sortOrder: 30 },
    }),
    prisma.activity.create({
      data: { name: 'VAB', code: 'VAB', category: 'ABSENCE', billableDefault: false, sortOrder: 31 },
    }),
    prisma.activity.create({
      data: { name: 'Semester', code: 'SEM', category: 'ABSENCE', billableDefault: false, sortOrder: 32 },
    }),
    prisma.activity.create({
      data: { name: 'Övertid 50%', code: 'OT50', category: 'WORK', billableDefault: true, sortOrder: 40 },
    }),
    prisma.activity.create({
      data: { name: 'Övertid 100%', code: 'OT100', category: 'WORK', billableDefault: true, sortOrder: 41 },
    }),
    prisma.activity.create({
      data: { name: 'OB-tillägg', code: 'OB', category: 'WORK', billableDefault: true, sortOrder: 42 },
    }),
  ]);

  console.log('✅ Aktiviteter skapade');

  console.log('\n🎉 Databas seedning klar!');
  console.log('\n📧 Logga in med:');
  console.log('   Admin: rick@anderssonsisolering.se / Rick1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
