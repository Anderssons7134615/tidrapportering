import type { FastifyReply, FastifyRequest } from 'fastify';

export type AppRole = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'ACCOUNTANT';

export function requireRoles(roles: readonly AppRole[], message = 'Åtkomst nekad') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await request.server.authenticate(request, reply);
    if (reply.sent) return;

    if (!roles.includes(request.user.role as AppRole)) {
      return reply.status(403).send({ error: message });
    }
  };
}

export function canWriteTime(role: string) {
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'EMPLOYEE';
}
