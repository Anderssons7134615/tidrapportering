import { createHash } from 'crypto';

type OfflineTimeEntryPayload = {
  userId: string;
  projectId?: string | null;
  activityId: string;
  date: Date;
  startTime?: string | null;
  endTime?: string | null;
  hours: number;
  billable: boolean;
  note?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
};

// The hash deliberately contains only the data that creates a time row. It is
// stable across retries and rejects reuse of one local id for different work.
export function createOfflineTimeEntryPayloadHash(entry: OfflineTimeEntryPayload) {
  const normalized = {
    userId: entry.userId,
    projectId: entry.projectId ?? null,
    activityId: entry.activityId,
    date: entry.date.toISOString(),
    startTime: entry.startTime ?? null,
    endTime: entry.endTime ?? null,
    hours: entry.hours,
    billable: entry.billable,
    note: entry.note ?? null,
    gpsLat: entry.gpsLat ?? null,
    gpsLng: entry.gpsLng ?? null,
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
