import type { OfflineSyncEntry } from './index';

export type TimeWritePayload = Omit<OfflineSyncEntry, 'ownerUserId' | 'localId' | 'note' | 'startTime' | 'endTime'> & {
  note?: string | null; startTime?: string | null; endTime?: string | null;
};
export type TimeWriteOperation =
  | { operation: 'CREATE'; payload: TimeWritePayload }
  | { operation: 'UPDATE'; id: string; revision: number; payload: Partial<TimeWritePayload> }
  | { operation: 'DELETE'; id: string; revision: number }
  | { operation: 'WEEK_VACATION'; payload: { weekStart: string; userId: string; hoursPerDay: number } };
export type TimeWriteRequest = TimeWriteOperation & { requestKey: string };
export interface TimeWriteAck {
  requestKey: string; outcome: 'CREATED' | 'UPDATED' | 'DELETED' | 'REPLAYED';
  resultIds: string[]; resourceExists: boolean; replayed: boolean; totalHours?: number;
}
