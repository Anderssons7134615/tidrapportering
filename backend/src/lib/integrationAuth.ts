import { createHash, timingSafeEqual } from 'node:crypto';

export const INTEGRATION_PERMISSIONS = ['READ_ONLY', 'MATERIAL_CREATE', 'PROJECT_CREATE'] as const;
export type IntegrationPermission = typeof INTEGRATION_PERMISSIONS[number];

export type IntegrationKeyRecord = {
  id: string;
  companyId: string;
  active: boolean;
  permission: IntegrationPermission;
  keyHash: string;
  revokedAt: Date | null;
};

export type IntegrationKeyRepository = {
  findByHash(keyHash: string): Promise<IntegrationKeyRecord | null>;
};

export type IntegrationScope = Pick<IntegrationKeyRecord, 'id' | 'companyId' | 'permission'>;

export function hashIntegrationKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function extractIntegrationKey(headers: Record<string, string | string[] | undefined>): string | null {
  const value = headers['x-tidapp-integration-key'];
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key || null;
}

function hashesMatch(expectedHash: string, suppliedHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'utf8');
  const actual = Buffer.from(suppliedHash, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function authenticateIntegrationKey(
  repository: IntegrationKeyRepository,
  suppliedKey: string | null,
): Promise<IntegrationScope | null> {
  if (!suppliedKey) return null;
  const suppliedHash = hashIntegrationKey(suppliedKey);
  const record = await repository.findByHash(suppliedHash);
  if (!record || !record.active || record.revokedAt !== null || !hashesMatch(record.keyHash, suppliedHash)) {
    return null;
  }
  return { id: record.id, companyId: record.companyId, permission: record.permission };
}
