import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRoles } from '../lib/authorization.js';

const customerSchema = z.object({
  name: z.string().min(2),
  orgNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  defaultRate: z.number().optional().nullable(),
});

const operationalCustomerSchema = customerSchema.omit({ defaultRate: true }).strict();
function publicCustomer(customer: any, role: string) {
  if (role === 'ADMIN') return customer;
  const { defaultRate, projects, ...safe } = customer;
  return { ...safe, ...(projects ? { projects: projects.map(({ fixedPrice, defaultRate, billingModel, budgetHours, ...project }: any) => project) } : {}) };
}

const requireAdminOrSupervisor = requireRoles(['ADMIN', 'SUPERVISOR']);

export function createCustomerRoutes(db: typeof prisma = prisma): FastifyPluginAsync {
  return async (fastify) => {
  // List customers (same company)
  fastify.get('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request) => {
    const { active } = request.query as { active?: string };

    const where: any = { companyId: request.user.companyId };
    if (active !== undefined) where.active = active === 'true';

    const customers = await db.customer.findMany({
      where,
      include: {
        _count: {
          select: { projects: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return customers.map(customer => publicCustomer(customer, request.user.role));
  });

  // Get customer by ID
  fastify.get('/:id', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer || customer.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Kund hittades inte' });
    }

    return publicCustomer(customer, request.user.role);
  });

  // Create customer
  fastify.post('/', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    try {
      const body = (request.user.role === 'ADMIN' ? customerSchema : operationalCustomerSchema).parse(request.body);

      const customer = await db.customer.create({
        data: { ...body, companyId: request.user.companyId },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE',
          entityType: 'Customer',
          entityId: customer.id,
          newValue: JSON.stringify({ name: customer.name }),
        },
      });

      return reply.status(201).send(publicCustomer(customer, request.user.role));
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
      const body = (request.user.role === 'ADMIN' ? customerSchema.partial() : operationalCustomerSchema.partial()).parse(request.body);

      const customer = await db.customer.findUnique({ where: { id } });
      if (!customer || customer.companyId !== request.user.companyId) {
        return reply.status(404).send({ error: 'Kund hittades inte' });
      }

      const updatedCustomer = await db.customer.update({
        where: { id },
        data: body,
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE',
          entityType: 'Customer',
          entityId: id,
          oldValue: JSON.stringify({ name: customer.name }),
          newValue: JSON.stringify(body),
        },
      });

      return publicCustomer(updatedCustomer, request.user.role);
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

    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer || customer.companyId !== request.user.companyId) {
      return reply.status(404).send({ error: 'Kund hittades inte' });
    }

    // Kontrollera att inga aktiva projekt finns
    const activeProjects = await db.project.count({
      where: { customerId: id, status: { in: ['PLANNED', 'ONGOING'] } },
    });

    if (activeProjects > 0) {
      return reply.status(400).send({
        error: 'Kan inte inaktivera kund med aktiva projekt'
      });
    }

    await db.customer.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await db.auditLog.create({
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
}

export default createCustomerRoutes();
