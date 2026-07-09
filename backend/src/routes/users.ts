import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';
import { deleteAttachmentFiles } from '../lib/attachments.js';
import { requireRoles } from '../lib/authorization.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT']),
  hourlyCost: z.number().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'ACCOUNTANT']).optional(),
  hourlyCost: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

const requireUserViewer = requireRoles(['ADMIN', 'SUPERVISOR', 'ACCOUNTANT']);
const requireAdmin = requireRoles(['ADMIN'], 'Endast admin har åtkomst');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users (only same company)
  fastify.get('/', {
    preHandler: [requireUserViewer],
  }, async (request) => {
    const users = await prisma.user.findMany({
      where: { companyId: request.user.companyId },
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

    // Användare kan bara se sig själva, admin/supervisor kan se alla i samma företag
    if (request.user.id !== id && !['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Åtkomst nekad' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        role: true,
        hourlyCost: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user || user.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    return user;
  });

  // Create user (same company)
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    try {
      const body = createUserSchema.parse(request.body);
      const email = normalizeEmail(body.email);

      const existingUser = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (existingUser) {
        return reply.status(400).send({ error: 'E-postadressen är redan registrerad' });
      }

      const hashedPassword = await bcrypt.hash(body.password, 10);

      const user = await prisma.user.create({
        data: {
          ...body,
          email,
          password: hashedPassword,
          companyId: request.user.companyId,
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
      if (!user || user.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Användare hittades inte' });
      }

      if (id === request.user.id && body.active === false) {
        return reply.status(400).send({ error: 'Du kan inte inaktivera ditt eget konto' });
      }

      const updateData = {
        ...body,
        ...(body.email ? { email: normalizeEmail(body.email) } : {}),
      };

      // Spara gamla värden för audit
      const oldValue = { email: user.email, name: user.name, role: user.role, active: user.active };

      const updatedUser = await prisma.$transaction(async (tx) => {
        const removesActiveAdmin = user.role === 'ADMIN' && user.active && (
          (updateData.role !== undefined && updateData.role !== 'ADMIN') || updateData.active === false
        );

        if (removesActiveAdmin) {
          const otherAdminCount = await tx.user.count({
            where: {
              companyId: request.user.companyId,
              id: { not: id },
              role: 'ADMIN',
              active: true,
            },
          });
          if (otherAdminCount === 0) {
            throw Object.assign(new Error('Företaget måste ha minst en aktiv admin'), { statusCode: 400 });
          }
        }

        return tx.user.update({
          where: { id },
          data: updateData,
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          oldValue: JSON.stringify(oldValue),
          newValue: JSON.stringify(updateData),
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
    if (!user || user.companyId !== request.user.companyId) {
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
    if (!user || user.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Användare hittades inte' });
    }

    // Ta bort all användardata
    const attachments = await prisma.attachment.findMany({
      where: { timeEntry: { userId: id } },
      select: { path: true },
    });

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
    deleteAttachmentFiles(attachments, fastify.log);

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
