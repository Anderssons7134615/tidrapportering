import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '../stores/offlineStore';
import { timeEntriesApi } from '../services/api';
import toast from 'react-hot-toast';

export function useSync() {
  const queryClient = useQueryClient();
  const { pendingEntries, clearPendingEntries, isOnline } = useOfflineStore();

  useEffect(() => {
    if (!isOnline || pendingEntries.length === 0) return;

    const sync = async () => {
      try {
        const { results } = await timeEntriesApi.sync(pendingEntries);

        const failed = results.filter((r) => r.error);
        if (failed.length > 0) {
          toast.error(`${failed.length} rad(er) kunde inte synkas`);
        } else {
          toast.success(`${results.length} rad(er) synkade`);
        }

        clearPendingEntries();
        queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
        queryClient.invalidateQueries({ queryKey: ['week'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      } catch (error) {
        console.error('Sync failed:', error);
      }
    };

    // Fördröj lite för att undvika spam
    const timeout = setTimeout(sync, 1000);
    return () => clearTimeout(timeout);
  }, [isOnline, pendingEntries, clearPendingEntries, queryClient]);
}
