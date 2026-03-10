import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
import workItemRoutes from './routes/workItems.js';
import workLogRoutes from './routes/workLogs.js';
import pushSubscriptionRoutes from './routes/pushSubscriptions.js';
import reminderRoutes from './routes/reminders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prisma client
export const prisma = new PrismaClient();

// Fastify instance
const fastify = Fastify({
  logger: true,
});

// Register plugins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
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

    // Tillåt även Cloudflare Pages-domäner under uppsättning
    const isPagesDomain = /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(normalized);

    if (isAllowed || isPagesDomain) {
      cb(null, true);
    } else {
      cb(new Error('Origin not allowed by CORS'), false);
    }
  },
  credentials: true,
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'default-secret-change-me',
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

// Static files for uploads
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

await fastify.register(fastifyStatic, {
  root: uploadDir,
  prefix: '/uploads/',
});

// Decorate fastify with authenticate
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();

    // Säkerställ att användare + företag fortfarande finns (viktigt efter reseed/reset av DB)
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, active: true, companyId: true },
    });

    if (!user || !user.active || user.companyId !== request.user.companyId) {
      return reply.status(401).send({ error: 'Sessionen är inte längre giltig, logga in igen' });
    }
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
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
fastify.register(workItemRoutes, { prefix: '/api/work-items' });
fastify.register(workLogRoutes, { prefix: '/api/work-logs' });
fastify.register(pushSubscriptionRoutes, { prefix: '/api/push-subscriptions' });
fastify.register(reminderRoutes, { prefix: '/api/reminders' });

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Enkel migrationssäkring för miljöer som inte hunnit köra Prisma migration/db push
const ensureProjectResultsVisibilityColumn = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Project"
      ADD COLUMN "employeeCanSeeResults" BOOLEAN NOT NULL DEFAULT false
    `);
    fastify.log.info('La till Project.employeeCanSeeResults');
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');

    // Kolumnen finns redan -> OK
    if (
      code === 'P2010' ||
      message.includes('duplicate column') ||
      message.includes('already exists') ||
      message.includes('duplicate column name')
    ) {
      fastify.log.debug('Project.employeeCanSeeResults finns redan');
      return;
    }

    throw error;
  }
};

// Start server
const start = async () => {
  try {
    await ensureProjectResultsVisibilityColumn();

    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Server körs på http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
