import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  companyName: z.string().min(2),
  orgNumber: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

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

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user || !user.active) {
        return reply.status(401).send({ error: 'Felaktig e-post eller lösenord' });
      }

      const validPassword = await bcrypt.compare(body.password, user.password);
      if (!validPassword) {
        return reply.status(401).send({ error: 'Felaktig e-post eller lösenord' });
      }

      // Hämta företagsnamn
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          ipAddress: request.ip,
        },
      });

      const token = fastify.jwt.sign(
        { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
        { expiresIn: '7d' }
      );

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: company?.name || '',
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Register new company
  fastify.post('/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Kontrollera att e-post inte redan finns
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'E-postadressen är redan registrerad' });
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      // Skapa företag, settings, admin-användare och aktiviteter i en transaktion
      const result = await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: body.companyName,
            orgNumber: body.orgNumber,
          },
        });

        await tx.settings.create({
          data: {
            companyId: company.id,
            companyName: body.companyName,
            vatRate: 25,
            weekStartDay: 1,
            csvDelimiter: ';',
            defaultCurrency: 'SEK',
            reminderTime: '15:30',
            reminderEnabled: true,
          },
        });

        const user = await tx.user.create({
          data: {
            companyId: company.id,
            email: body.email,
            password: hashedPassword,
            name: body.name,
            role: 'ADMIN',
          },
        });

        // Skapa standardaktiviteter
        for (const activity of DEFAULT_ACTIVITIES) {
          await tx.activity.create({
            data: { ...activity, companyId: company.id },
          });
        }

        return { company, user };
      });

      const token = fastify.jwt.sign(
        {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          companyId: result.company.id,
        },
        { expiresIn: '7d' }
      );

      return reply.status(201).send({
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          companyId: result.company.id,
          companyName: result.company.name,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Get current user
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw { statusCode: 404, message: 'Användare hittades inte' };
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hourlyCost: user.hourlyCost,
      active: user.active,
      createdAt: user.createdAt,
      companyId: user.companyId,
      companyName: user.company.name,
    };
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(6),
    });

    try {
      const body = schema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Användare hittades inte' });
      }

      const validPassword = await bcrypt.compare(body.currentPassword, user.password);
      if (!validPassword) {
        return reply.status(400).send({ error: 'Nuvarande lösenord är felaktigt' });
      }

      const hashedPassword = await bcrypt.hash(body.newPassword, 10);

      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return { message: 'Lösenord ändrat' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });
};

export default authRoutes;
