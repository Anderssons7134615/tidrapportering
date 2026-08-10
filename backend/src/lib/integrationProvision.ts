import { hashIntegrationKey } from './integrationAuth.js';

const INTEGRATION_NAME = 'Hermes read-only adapter';
const MINIMUM_KEY_LENGTH = 32;
const PROVISION_KEY_LENGTH = 64;
const PROVISION_KEY_PATTERN = /^[A-Za-z0-9_-]{64}$/;

export type IntegrationProvisionInput = {
  key: string;
  companyIds: string[];
};

export type IntegrationProvisionData = {
  companyId: string;
  name: typeof INTEGRATION_NAME;
  keyHash: string;
  active: true;
  permission: 'READ_ONLY';
};

export function parseProvisionKey(input: Buffer): string {
  if (input.length !== PROVISION_KEY_LENGTH) {
    throw new Error('INTEGRATION_KEY_STDIN_INVALID');
  }

  const key = input.toString('ascii');
  if (!PROVISION_KEY_PATTERN.test(key)) {
    throw new Error('INTEGRATION_KEY_STDIN_INVALID');
  }

  return key;
}

export function prepareIntegrationProvision(input: IntegrationProvisionInput): IntegrationProvisionData {
  if (input.key.length < MINIMUM_KEY_LENGTH) {
    throw new Error('INTEGRATION_KEY_TOO_SHORT');
  }
  if (input.companyIds.length !== 1) {
    throw new Error('COMPANY_SCOPE_AMBIGUOUS');
  }

  return {
    companyId: input.companyIds[0],
    name: INTEGRATION_NAME,
    keyHash: hashIntegrationKey(input.key),
    active: true,
    permission: 'READ_ONLY',
  };
}
