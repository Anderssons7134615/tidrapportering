import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';

const customerSchema = z.object({
  name: z.string().min(2),
  orgNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  defaultRate: z.number().optional().nullable(),
});

const requireAdminOrSupervisor = async (request: any, reply: any) => {
  await request.jwtVerify();
  if (!['ADMIN', 'SUPERVISOR'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Åtkomst nekad' });
  }
};

const customerRoutes: FastifyPluginAsync = async (fastify) => {
  // List customers
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where = active !== undefined ? { active: active === 'true' } : {};

    const customers = await prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: { projects: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return customers;
  });

  // Get customer by ID
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return reply.status(404).send({ error: 'Kund hittades inte' });
    }

    return customer;
  });

  // Create customer
  fastify.post('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = customerSchema.parse(request.body);

      const customer = await prisma.customer.create({
        data: body,
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'Customer',
          entityId: customer.id,
          newValue: JSON.stringify({ name: customer.name }),
        },
      });

      return reply.status(201).send(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Update customer
  fastify.put('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = customerSchema.partial().parse(request.body);

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return reply.status(404).send({ error: 'Kund hittades inte' });
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: body,
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'Customer',
          entityId: id,
          oldValue: JSON.stringify({ name: customer.name }),
          newValue: JSON.stringify(body),
        },
      });

      return updatedCustomer;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
      }
      throw error;
    }
  });

  // Delete customer (soft delete)
  fastify.delete('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return reply.status(404).send({ error: 'Kund hittades inte' });
    }

    // Kontrollera att inga aktiva projekt finns
    const activeProjects = await prisma.project.count({
      where: { customerId: id, status: { in: ['PLANNED', 'ONGOING'] } },
    });

    if (activeProjects > 0) {
      return reply.status(400).send({
        error: 'Kan inte inaktivera kund med aktiva projekt'
      });
    }

    await prisma.customer.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'DELETE',
        entityType: 'Customer',
        entityId: id,
        oldValue: JSON.stringify({ name: customer.name }),
      },
    });

    return { message: 'Kund inaktiverad' };
  });
};

export default customerRoutes;
