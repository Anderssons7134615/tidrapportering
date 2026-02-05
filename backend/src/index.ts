import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import path from 'path';
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
];

await fastify.register(cors, {
  origin: allowedOrigins,
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
const uploadDir = path.resolve(__dirname, '../../uploads');
await fastify.register(fastifyStatic, {
  root: uploadDir,
  prefix: '/uploads/',
});

// Decorate fastify with authenticate
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
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
    payload: { id: string; email: string; role: string };
    user: { id: string; email: string; role: string };
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

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
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
