import { createHash } from 'node:crypto';

export const PROJECT_UPDATE_TYPES = ['NOTE', 'STATUS', 'RISK', 'DECISION', 'NEXT_STEP'] as const;
export type ProjectUpdateType = typeof PROJECT_UPDATE_TYPES[number];
export type ProjectUpdateSource = 'TIDAPP' | 'CHATGPT';

export type ProjectUpdateDraft = {
  companyId: string;
  projectId: string;
  projectCode: string;
  projectUpdatedAt: string;
  userId: string;
  type: ProjectUpdateType;
  content: string;
  occurredAt: string;
  source: ProjectUpdateSource;
  idempotencyKey: string;
};

export type ProjectUpdatePreviewToken = ProjectUpdateDraft & {
  scope: 'project-update-preview';
  payloadHash: string;
};

export function normalizeProjectCode(value: string) {
  return value.trim();
}

export function normalizeProjectUpdateContent(value: string) {
  return value.trim();
}

export function createProjectUpdatePayloadHash(draft: ProjectUpdateDraft) {
  return createHash('sha256')
    .update(JSON.stringify({
      companyId: draft.companyId,
      projectId: draft.projectId,
      projectCode: draft.projectCode,
      type: draft.type,
      content: draft.content,
      occurredAt: draft.occurredAt,
      source: draft.source,
    }))
    .digest('hex');
}

export function isProjectUpdatePreviewToken(value: unknown): value is ProjectUpdatePreviewToken {
  if (!value || typeof value !== 'object') return false;
  const token = value as Record<string, unknown>;

  return token.scope === 'project-update-preview'
    && typeof token.companyId === 'string'
    && typeof token.projectId === 'string'
    && typeof token.projectCode === 'string'
    && typeof token.projectUpdatedAt === 'string'
    && typeof token.userId === 'string'
    && PROJECT_UPDATE_TYPES.includes(token.type as ProjectUpdateType)
    && typeof token.content === 'string'
    && typeof token.occurredAt === 'string'
    && (token.source === 'TIDAPP' || token.source === 'CHATGPT')
    && typeof token.idempotencyKey === 'string'
    && typeof token.payloadHash === 'string';
}
