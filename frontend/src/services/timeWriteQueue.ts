import { useAuthStore } from '../stores/authStore';
import { useOfflineStore, type PendingEntry } from '../stores/offlineStore';
import type { TimeWriteAck, TimeWriteOperation } from '../types/timeWrite';
import { timeEntriesApi } from './api';

const flights = new Map<string, Promise<TimeWriteAck>>();
export function ownsOperation(row: PendingEntry) {
  const user = useAuthStore.getState().user;
  return Boolean(user && row.ownerUserId === user.id && (!row.ownerCompanyId || row.ownerCompanyId === user.companyId));
}
export function operationOf(row: PendingEntry): TimeWriteOperation {
  if (row.write) return row.write;
  // Keep the exact v2 key and payload on upgrade.
  const { userId, projectId, activityId, date, startTime, endTime, hours, billable, note, gpsLat, gpsLng } = row;
  return { operation: 'CREATE', payload: { userId, projectId, activityId, date, startTime, endTime, hours, billable, note, gpsLat, gpsLng } };
}
export function enqueueTimeWrite(write: TimeWriteOperation): PendingEntry {
  const user = useAuthStore.getState().user;
  if (!user?.id || !user.companyId) throw new Error('Logga in igen innan du sparar.');
  if (('revision' in write) && !Number.isInteger(write.revision)) throw new Error('Hämta tidraden igen för att få den senaste versionen.');
  const state = useOfflineStore.getState();
  // Separate new time reports may intentionally have identical values.
  const existing = write.operation !== 'CREATE' && state.pendingEntries.find(row => ownsOperation(row) && JSON.stringify(operationOf(row)) === JSON.stringify(write));
  if (existing) return existing;
  const payload = 'payload' in write ? write.payload : {};
  return state.addOperation({ ownerUserId: user.id, ownerCompanyId: user.companyId, write,
    date: 'date' in payload ? payload.date || '' : 'weekStart' in payload ? payload.weekStart : '',
    hours: 'hours' in payload ? payload.hours || 0 : 'hoursPerDay' in payload ? payload.hoursPerDay * 5 : 0,
    activityId: 'activityId' in payload ? payload.activityId || '' : '',
    billable: 'billable' in payload ? payload.billable ?? false : false,
    ...('projectId' in payload ? { projectId: payload.projectId } : {}),
    ...('note' in payload ? { note: payload.note ?? undefined } : {}),
  });
}
export function dispatchTimeWrite(row: PendingEntry): Promise<TimeWriteAck> {
  const ongoing = flights.get(row.localId);
  if (ongoing) return ongoing;
  const send = async () => {
    if (!ownsOperation(row)) throw new Error('Sparandet tillhör ett annat konto.');
    if (row.syncErrorCode === 'LEGACY_SYNC_REQUIRES_REVIEW') throw new Error(row.syncError);
    try {
      const operation = operationOf(row);
      const ack = await timeEntriesApi.write({ ...operation, requestKey: row.localId });
      const expected = operation.operation === 'UPDATE' ? 'UPDATED' : operation.operation === 'DELETE' ? 'DELETED' : 'CREATED';
      if (ack.requestKey !== row.localId || ![expected, 'REPLAYED'].includes(ack.outcome) || !ack.resultIds?.length || ('id' in operation && ack.resultIds[0] !== operation.id)) {
        throw Object.assign(new Error('Serverns kvittens saknas. Sparandet ligger kvar för ett nytt försök.'), { code: 'SYNC_RESPONSE_INCOMPLETE' });
      }
      useOfflineStore.getState().removePendingEntries([row.localId]);
      return ack;
    } catch (error) {
      const err = error as Error & { status?: number; code?: string };
      const retryable = !err.status || err.status >= 500 || [408, 429].includes(err.status);
      const attempts = (row.attempts || 0) + 1;
      useOfflineStore.getState().updateOperation(row.localId, {
        syncError: retryable ? 'Sparandet är inte bekräftat. Appen försöker igen med samma sparnyckel.' : err.message,
        syncErrorCode: err.code || (retryable ? 'SYNC_CONFIRMATION_MISSING' : 'WRITE_REJECTED'),
        retryable, attempts, retryAt: retryable ? Date.now() + Math.min(30000, 2000 * 2 ** Math.min(attempts, 4)) : undefined,
        mayHaveCommitted: row.mayHaveCommitted || retryable,
      });
      throw error;
    }
  };
  const promise = send().finally(() => flights.delete(row.localId));
  flights.set(row.localId, promise);
  return promise;
}
export async function saveTimeWrite(write: TimeWriteOperation) {
  const row = enqueueTimeWrite(write);
  if (!useOfflineStore.getState().isOnline) return null;
  return dispatchTimeWrite(row);
}
