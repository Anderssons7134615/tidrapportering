import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Prisma, PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { ensureUploadDir } from './lib/uploads.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import customerRoutes from './routes/customers.js';
import projectRoutes from './routes/projects.js';
import activityRoutes from './routes/activities.js';
import timeEntryRoutes from './routes/timeEntries.js';
import weekLockRoutes from './routes/weekLocks.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import pushSubscriptionRoutes from './routes/pushSubscriptions.js';
import reminderRoutes from './routes/reminders.js';
import obsidianSyncRoutes from './routes/obsidianSync.js';

// Prisma client
export const prisma = new PrismaClient();

// Fastify instance
const fastify = Fastify({
  logger: true,
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET måste vara satt. Generera ett långt slumpat värde i miljövariablerna.');
}

// Register plugins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://tid.anderssonsisolering.se',
  'https://tidrapportering.pages.dev',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ...(process.env.EXTRA_CORS_ORIGINS
    ? process.env.EXTRA_CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
];

await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);

    const normalized = origin.replace(/\/$/, '');
    const isAllowed = allowedOrigins.some((o) => o.replace(/\/$/, '') === normalized);

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
});

await fastify.register(jwt, {
  secret: jwtSecret,
});

await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Static files for uploads är avstängt som standard i produktion.
// Bilagor ska normalt hämtas via autentiserad API-route i timeEntries.ts.
const uploadDir = ensureUploadDir();

if (process.env.PUBLIC_UPLOADS_ENABLED === 'true') {
  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
  });
}

// Decorate fastify with authenticate
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();

    // Säkerställ att användare + företag fortfarande finns (viktigt efter reseed/reset av DB)
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, role: true, active: true, companyId: true },
    });

    if (!user || !user.active || user.companyId !== request.user.companyId) {
      return reply.status(401).send({ error: 'Sessionen är inte längre giltig, logga in igen' });
    }

    // Använd alltid aktuell roll/e-post från databasen så rolländringar slår igenom direkt
    // även om användaren har en gammal JWT-token.
    request.user = {
      ...request.user,
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

fastify.setErrorHandler((error: any, request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'Ogiltig data', details: error.errors });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return reply.status(409).send({ error: 'Informationen ändrades samtidigt av någon annan. Försök igen.' });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return reply.status(409).send({ error: 'Det finns redan en post med samma unika värde.' });
  }

  const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  if (statusCode >= 500) request.log.error(error);

  return reply.status(statusCode).send({
    error: statusCode >= 500 ? 'Ett internt serverfel uppstod' : error.message,
  });
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; companyId: string };
    user: { id: string; email: string; role: string; companyId: string };
  }
}

// Register routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(userRoutes, { prefix: '/api/users' });
fastify.register(customerRoutes, { prefix: '/api/customers' });
fastify.register(projectRoutes, { prefix: '/api/projects' });
fastify.register(activityRoutes, { prefix: '/api/activities' });
fastify.register(timeEntryRoutes, { prefix: '/api/time-entries' });
fastify.register(weekLockRoutes, { prefix: '/api/week-locks' });
fastify.register(reportRoutes, { prefix: '/api/reports' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });
fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
fastify.register(pushSubscriptionRoutes, { prefix: '/api/push-subscriptions' });
fastify.register(reminderRoutes, { prefix: '/api/reminders' });
fastify.register(obsidianSyncRoutes, { prefix: '/api/obsidian-sync' });

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.get('/api/ready', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ready', timestamp: new Date().toISOString() };
  } catch (error) {
    fastify.log.error(error, 'Databasens readiness-kontroll misslyckades');
    return reply.status(503).send({ status: 'not-ready' });
  }
});
// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Server körs på http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

let isShuttingDown = false;
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  fastify.log.info({ signal }, 'Stänger TidApp');

  try {
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, 'Kunde inte stänga TidApp korrekt');
    process.exit(1);
  }
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
