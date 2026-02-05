import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

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
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: '7d' }
      );

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
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
      throw { statusCode: 404, message: 'Användare hittades inte' };
    }

    return user;
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
