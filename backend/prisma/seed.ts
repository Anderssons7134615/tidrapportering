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
      companyName: 'Bygg & Montage Stockholm AB',
      vatRate: 25,
      weekStartDay: 1,
      csvDelimiter: ';',
      defaultCurrency: 'SEK',
      reminderTime: '15:30',
      reminderEnabled: true,
    },
  });

  // Skapa användare
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@byggab.se',
      password: hashedPassword,
      name: 'Anna Adminsson',
      role: 'ADMIN',
      hourlyCost: 450,
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      email: 'lars@byggab.se',
      password: hashedPassword,
      name: 'Lars Ledare',
      role: 'SUPERVISOR',
      hourlyCost: 400,
    },
  });

  const employee1 = await prisma.user.create({
    data: {
      email: 'erik@byggab.se',
      password: hashedPassword,
      name: 'Erik Elektriker',
      role: 'EMPLOYEE',
      hourlyCost: 350,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      email: 'maria@byggab.se',
      password: hashedPassword,
      name: 'Maria Montör',
      role: 'EMPLOYEE',
      hourlyCost: 350,
    },
  });

  const employee3 = await prisma.user.create({
    data: {
      email: 'peter@byggab.se',
      password: hashedPassword,
      name: 'Peter Plåtslagare',
      role: 'EMPLOYEE',
      hourlyCost: 380,
    },
  });

  console.log('✅ Användare skapade');

  // Skapa kunder
  const customer1 = await prisma.customer.create({
    data: {
      name: 'Fastighets AB Centrum',
      orgNumber: '556123-4567',
      address: 'Storgatan 15, 111 22 Stockholm',
      contactPerson: 'Karin Karlsson',
      email: 'karin@fastighetscentrum.se',
      phone: '08-123 45 67',
      defaultRate: 850,
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      name: 'BRF Solsidan',
      orgNumber: '769012-3456',
      address: 'Solvägen 8, 123 45 Solna',
      contactPerson: 'Bengt Bengtsson',
      email: 'styrelsen@brfsolsidan.se',
      phone: '08-987 65 43',
      defaultRate: 750,
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      name: 'Restaurang Smaken',
      orgNumber: '556789-0123',
      address: 'Matgatan 3, 112 34 Stockholm',
      contactPerson: 'Sofia Svensson',
      email: 'sofia@smaken.se',
      phone: '08-555 12 34',
      defaultRate: 800,
    },
  });

  console.log('✅ Kunder skapade');

  // Skapa projekt
  const project1 = await prisma.project.create({
    data: {
      customerId: customer1.id,
      name: 'Fasadrenovering Storgatan',
      code: 'P2024-001',
      site: 'Storgatan 15, Stockholm',
      status: 'ONGOING',
      budgetHours: 200,
      billingModel: 'HOURLY',
      defaultRate: 850,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      customerId: customer2.id,
      name: 'Balkongrenoveringar',
      code: 'P2024-002',
      site: 'Solvägen 8, Solna',
      status: 'ONGOING',
      budgetHours: 500,
      billingModel: 'FIXED',
      defaultRate: 750,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      customerId: customer3.id,
      name: 'Köksrenovering',
      code: 'P2024-003',
      site: 'Matgatan 3, Stockholm',
      status: 'PLANNED',
      budgetHours: 80,
      billingModel: 'HOURLY',
      defaultRate: 800,
    },
  });

  const project4 = await prisma.project.create({
    data: {
      customerId: customer1.id,
      name: 'Takarbete Kontoret',
      code: 'P2024-004',
      site: 'Storgatan 15, Stockholm',
      status: 'COMPLETED',
      budgetHours: 40,
      billingModel: 'HOURLY',
      defaultRate: 850,
    },
  });

  // Internt projekt för administration
  const internalProject = await prisma.project.create({
    data: {
      customerId: null,
      name: 'Internt',
      code: 'INTERN',
      site: 'Kontoret',
      status: 'ONGOING',
      billingModel: 'HOURLY',
    },
  });

  console.log('✅ Projekt skapade');

  // Skapa aktiviteter
  const activities = await Promise.all([
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
      data: { name: 'Service', code: 'SERV', category: 'WORK', billableDefault: true, sortOrder: 4 },
    }),
    prisma.activity.create({
      data: { name: 'ÄTA-arbete', code: 'ATA', category: 'CHANGE_ORDER', billableDefault: true, sortOrder: 5 },
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

  const [montage, rivning, installation, service, ata, resa, mote, byggmote, admin_act, utb, sjuk, vab, semester] = activities;

  console.log('✅ Aktiviteter skapade');

  // Skapa tidrader för de senaste 4 veckorna
  const today = new Date();
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const currentMonday = getMonday(today);

  // Hjälpfunktion för att skapa datum
  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Tidrader för Erik (förra veckan - godkänd, denna vecka - draft)
  const lastMonday = addDays(currentMonday, -7);

  // Förra veckans godkända tidrader för Erik
  for (let i = 0; i < 5; i++) {
    await prisma.timeEntry.create({
      data: {
        userId: employee1.id,
        projectId: project1.id,
        activityId: montage.id,
        date: addDays(lastMonday, i),
        hours: 8,
        billable: true,
        note: `Montagearbete dag ${i + 1}`,
        status: 'APPROVED',
        submittedAt: addDays(lastMonday, 5),
        approvedAt: addDays(lastMonday, 6),
        approverId: supervisor.id,
      },
    });
  }

  // Resa för Erik förra veckan
  await prisma.timeEntry.create({
    data: {
      userId: employee1.id,
      projectId: project1.id,
      activityId: resa.id,
      date: lastMonday,
      hours: 1,
      billable: true,
      note: 'Resa till Storgatan',
      status: 'APPROVED',
      submittedAt: addDays(lastMonday, 5),
      approvedAt: addDays(lastMonday, 6),
      approverId: supervisor.id,
    },
  });

  // Denna veckas draft-tidrader för Erik
  const daysThisWeek = Math.min((today.getDay() || 7) - 1, 4); // Antal vardagar hittills
  for (let i = 0; i <= daysThisWeek; i++) {
    await prisma.timeEntry.create({
      data: {
        userId: employee1.id,
        projectId: project1.id,
        activityId: installation.id,
        date: addDays(currentMonday, i),
        hours: i === daysThisWeek ? 4 : 8, // Halvdag idag
        billable: true,
        note: 'Elinstallation',
        status: 'DRAFT',
      },
    });
  }

  // Tidrader för Maria (förra veckan - inskickad för attest)
  for (let i = 0; i < 5; i++) {
    await prisma.timeEntry.create({
      data: {
        userId: employee2.id,
        projectId: project2.id,
        activityId: montage.id,
        date: addDays(lastMonday, i),
        hours: 7.5,
        billable: true,
        note: 'Balkongarbete',
        status: 'SUBMITTED',
        submittedAt: addDays(lastMonday, 5),
      },
    });
  }

  // Skapa WeekLock för Maria
  await prisma.weekLock.create({
    data: {
      userId: employee2.id,
      weekStartDate: lastMonday,
      status: 'SUBMITTED',
      submittedAt: addDays(lastMonday, 5),
    },
  });

  // Tidrader för Peter (blandad - lite sjuk, lite arbete)
  await prisma.timeEntry.create({
    data: {
      userId: employee3.id,
      projectId: null,
      activityId: sjuk.id,
      date: addDays(lastMonday, 0),
      hours: 8,
      billable: false,
      note: 'Sjuk',
      status: 'APPROVED',
      submittedAt: addDays(lastMonday, 5),
      approvedAt: addDays(lastMonday, 6),
      approverId: supervisor.id,
    },
  });

  for (let i = 1; i < 5; i++) {
    await prisma.timeEntry.create({
      data: {
        userId: employee3.id,
        projectId: project4.id,
        activityId: service.id,
        date: addDays(lastMonday, i),
        hours: 8,
        billable: true,
        note: 'Takservice',
        status: 'APPROVED',
        submittedAt: addDays(lastMonday, 5),
        approvedAt: addDays(lastMonday, 6),
        approverId: supervisor.id,
      },
    });
  }

  // WeekLock för Peter (godkänd)
  await prisma.weekLock.create({
    data: {
      userId: employee3.id,
      weekStartDate: lastMonday,
      status: 'APPROVED',
      submittedAt: addDays(lastMonday, 5),
      reviewedAt: addDays(lastMonday, 6),
      reviewerId: supervisor.id,
    },
  });

  // WeekLock för Erik (godkänd)
  await prisma.weekLock.create({
    data: {
      userId: employee1.id,
      weekStartDate: lastMonday,
      status: 'APPROVED',
      submittedAt: addDays(lastMonday, 5),
      reviewedAt: addDays(lastMonday, 6),
      reviewerId: supervisor.id,
    },
  });

  console.log('✅ Tidrader och veckolås skapade');

  // Skapa audit log exempel
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'CREATE',
      entityType: 'Project',
      entityId: project1.id,
      newValue: JSON.stringify({ name: project1.name, code: project1.code }),
    },
  });

  console.log('✅ Audit log skapad');

  console.log('\n🎉 Databas seedning klar!');
  console.log('\n📧 Testanvändare:');
  console.log('   Admin: admin@byggab.se / password123');
  console.log('   Arbetsledare: lars@byggab.se / password123');
  console.log('   Medarbetare: erik@byggab.se / password123');
  console.log('   Medarbetare: maria@byggab.se / password123');
  console.log('   Medarbetare: peter@byggab.se / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
