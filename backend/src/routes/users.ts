import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']),
  hourlyCost: z.number().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'EMPLOYEE']).optional(),
  hourlyCost: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

// Middleware för att kontrollera admin/supervisor
const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const requireAdmin = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (request.user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Endast admin har åtkomst' });
  }
};

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users
  fastify.get('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        hourlyCost: true,
        active: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return users;
  });

  // Get user by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Användare kan bara se sig själva, admin/supervisor kan se alla
    if (request.user.id !== id && !['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        hourlyCost: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    return user;
  });

  // Create user
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = createUserSchema.parse(request.body);

      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'E-postadressen är redan registrerad' });
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const user = await prisma.user.create({
        data: {
          ...body,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          hourlyCost: true,
          active: true,
          createdAt: true,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          newValue: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
        },
      });

      return reply.status(201).send(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update user
  fastify.put('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateUserSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'Användare hittades inte' });
      }

      // Spara gamla värden för audit
      const oldValue = { email: user.email, name: user.name, role: user.role, active: user.active };

      const updatedUser = await prisma.user.update({
        where: { id },
        data: body,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          hourlyCost: true,
          active: true,
          createdAt: true,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          oldValue: JSON.stringify(oldValue),
          newValue: JSON.stringify(body),
        },
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete user (soft delete - inaktivera)
  fastify.delete('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Kan inte ta bort sig själv
    if (request.user.id === id) {
      return reply.status(400).send({ error: 'Du kan inte ta bort dig själv' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'User',
        entityId: id,
        oldValue: JSON.stringify({ email: user.email, name: user.name }),
      },
    });

    return { message: 'Användare inaktiverad' };
  });

  // GDPR: Radera användare permanent
  fastify.delete('/:id/gdpr', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (request.user.id === id) {
      return reply.status(400).send({ error: 'Du kan inte ta bort dig själv' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    // Ta bort all användardata
    await prisma.$transaction([
      prisma.attachment.deleteMany({
        where: { timeEntry: { userId: id } },
      }),
      prisma.timeEntry.deleteMany({ where: { userId: id } }),
      prisma.weekLock.deleteMany({ where: { userId: id } }),
      prisma.auditLog.updateMany({
        where: { userId: id },
        data: { userId: null },
      }),
      prisma.user.delete({ where: { id } }),
    ]);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'GDPR_DELETE',
        entityType: 'User',
        entityId: id,
        oldValue: JSON.stringify({ email: user.email, name: user.name }),
      },
    });

    return { message: 'Användare och all relaterad data har raderats permanent' };
  });
};

export default userRoutes;
