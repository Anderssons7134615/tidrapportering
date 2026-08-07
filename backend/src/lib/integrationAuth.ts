import { createHash, timingSafeEqual } from 'node:crypto';

export type IntegrationKeyRecord = {
  id: string;
  companyId: string;
  active: boolean;
};

export type IntegrationKeyRepository = {
  findByHash(keyHash: string): Promise<IntegrationKeyRecord | null>;
};

export type IntegrationScope = Pick<IntegrationKeyRecord, 'id' | 'companyId'>;

export function hashIntegrationKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function extractIntegrationKey(headers: Record<string, string | string[] | undefined>): string | null {
  const value = headers['x-tidapp-integration-key'];
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key || null;
}

function hashesMatch(expectedHash: string, suppliedKey: string): boolean {
  const expected = Buffer.from(expectedHash, 'utf8');
  const actual = Buffer.from(hashIntegrationKey(suppliedKey), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function authenticateIntegrationKey(
  repository: IntegrationKeyRepository,
  suppliedKey: string | null,
): Promise<IntegrationScope | null> {
  if (!suppliedKey) return null;
  const record = await repository.findByHash(hashIntegrationKey(suppliedKey));
  if (!record || !record.active || !hashesMatch(hashIntegrationKey(suppliedKey), suppliedKey)) {
    return null;
  }
  return { id: record.id, companyId: record.companyId };
}
