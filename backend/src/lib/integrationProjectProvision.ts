import { hashIntegrationKey } from './integrationAuth.js';

export type ProjectIntegrationProvisionInput = {
  key: string;
  companyIds: string[];
};

export type ProjectIntegrationProvisionData = {
  companyId: string;
  name: 'Hermes project-create adapter';
  keyHash: string;
  active: true;
  permission: 'PROJECT_CREATE';
};

export function prepareProjectIntegrationProvision(input: ProjectIntegrationProvisionInput): ProjectIntegrationProvisionData {
  if (input.key.length !== 64 || !/^[A-Za-z0-9_-]{64}$/.test(input.key)) {
    throw new Error('INTEGRATION_KEY_INVALID');
  }
  if (input.companyIds.length !== 1) {
    throw new Error('COMPANY_SCOPE_AMBIGUOUS');
  }
  return {
    companyId: input.companyIds[0],
    name: 'Hermes project-create adapter',
    keyHash: hashIntegrationKey(input.key),
    active: true,
    permission: 'PROJECT_CREATE',
  };
}
