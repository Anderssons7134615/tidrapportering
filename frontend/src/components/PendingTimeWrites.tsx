import { Link } from 'react-router-dom';
import { useOfflineStore } from '../stores/offlineStore';
import { operationOf, ownsOperation } from '../services/timeWriteQueue';
import { useAuthStore } from '../stores/authStore';

const labels = { CREATE: 'Ny tidrad', UPDATE: 'Ändrad tidrad', DELETE: 'Radering av tidrad', WEEK_VACATION: 'Semestervecka' };
export function PendingTimeWrites() {
  useAuthStore(state => state.user);
  const { pendingEntries, removePendingEntries } = useOfflineStore();
  const own = pendingEntries.filter(ownsOperation);
  if (!own.length) return null;
  return <details open className="border-b border-graphite-200 bg-white px-4 py-2 text-sm">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{own.length} sparade ändringar väntar på kvittens</summary>
    <ul className="divide-y divide-graphite-200">
      {own.map(row => {
        const write = operationOf(row);
        const editable = row.retryable === false && !row.mayHaveCommitted && row.syncErrorCode !== 'LEGACY_SYNC_REQUIRES_REVIEW';
        return <li key={row.localId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p>{labels[write.operation]}{row.date ? ` · ${row.date.slice(0, 10)}` : ''}{row.hours ? ` · ${row.hours.toLocaleString('sv-SE')} h` : ''}</p>
            <p className="text-graphite-600">{row.syncError || 'Sparad på enheten. Ingår i veckans summering först efter serverns kvittens.'}</p>
            {row.mayHaveCommitted && row.retryable === false && <p>Utfallet behöver kontrolleras mot servern. De sparade uppgifterna behålls.</p>}
          </div>
          {['CREATE', 'UPDATE'].includes(write.operation) && <Link className="btn-secondary" to={`/time-entry?pending=${row.localId}${'id' in write ? `&id=${write.id}` : ''}`}>Visa sparade uppgifter</Link>}
          {editable && ['DELETE', 'WEEK_VACATION'].includes(write.operation) && <button type="button" className="btn-secondary" onClick={() => removePendingEntries([row.localId])}>Avsluta avvisat försök</button>}
        </li>;
      })}
    </ul>
  </details>;
}
