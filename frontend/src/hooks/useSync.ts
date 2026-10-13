import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '../stores/offlineStore';
import { useAuthStore } from '../stores/authStore';
import { dispatchTimeWrite, ownsOperation } from '../services/timeWriteQueue';
import { refreshTimeQueries } from '../utils/timeQueries';

export function useSync() {
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const { pendingEntries, isOnline } = useOfflineStore();
  useEffect(() => {
    if (!isOnline || !user) return;
    const row = pendingEntries.find(entry => ownsOperation(entry) && (!entry.syncError || entry.retryable));
    if (!row) return;
    const timer = window.setTimeout(async () => {
      try {
        await dispatchTimeWrite(row);
        if (ownsOperation(row)) void refreshTimeQueries(queryClient);
      } catch { /* Journalen visar felet och behåller nästa försök. */ }
    }, Math.max(1000, (row.retryAt || 0) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pendingEntries, isOnline, user, queryClient]);
}
