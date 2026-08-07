import { hashIntegrationKey } from './integrationAuth.js';

const INTEGRATION_NAME = 'Hermes read-only adapter';
const MINIMUM_KEY_LENGTH = 32;

export type IntegrationProvisionInput = {
  key: string;
  companyIds: string[];
  existingKey: boolean;
};

export type IntegrationProvisionData = {
  companyId: string;
  name: typeof INTEGRATION_NAME;
  keyHash: string;
  active: true;
};

export function prepareIntegrationProvision(input: IntegrationProvisionInput): IntegrationProvisionData {
  if (input.key.length < MINIMUM_KEY_LENGTH) {
    throw new Error('INTEGRATION_KEY_TOO_SHORT');
  }
  if (input.existingKey) {
    throw new Error('INTEGRATION_KEY_ALREADY_EXISTS');
  }
  if (input.companyIds.length !== 1) {
    throw new Error('COMPANY_SCOPE_AMBIGUOUS');
  }

  return {
    companyId: input.companyIds[0],
    name: INTEGRATION_NAME,
    keyHash: hashIntegrationKey(input.key),
    active: true,
  };
}
