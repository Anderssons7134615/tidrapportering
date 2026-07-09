import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '../stores/offlineStore';
import { timeEntriesApi } from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export function useSync() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { pendingEntries, removePendingEntries, isOnline } = useOfflineStore();
  const lastFailureSignature = useRef('');
  const syncing = useRef(false);
  const retryTimer = useRef<number>();
  const [retryNonce, setRetryNonce] = useState(0);
  const ownedPendingEntries = useMemo(
    () => pendingEntries.filter((entry) => entry.ownerUserId === user?.id),
    [pendingEntries, user?.id]
  );

  useEffect(() => {
    if (!isOnline || !user || ownedPendingEntries.length === 0 || syncing.current) return;

    const sync = async () => {
      syncing.current = true;
      const entriesToSync = [...ownedPendingEntries];
      try {
        const { results } = await timeEntriesApi.sync(entriesToSync);

        const failed = results.filter((r) => r.error);
        if (failed.length > 0) {
          const signature = failed.map((result) => `${result.localId || result.id || 'okänd'}:${result.error}`).join('|');
          if (signature !== lastFailureSignature.current) {
            const firstReason = failed[0]?.error ? `: ${failed[0].error}` : '';
            toast.error(`${failed.length} rad(er) kunde inte synkas${firstReason}`);
            console.warn('TidApp sync failed rows:', failed);
            lastFailureSignature.current = signature;
          }
        } else {
          toast.success(`${results.length} rad(er) synkade`);
          lastFailureSignature.current = '';
        }

        const successfulLocalIds = results
          .filter((result) => !result.error && result.localId)
          .map((result) => result.localId as string);
        if (successfulLocalIds.length > 0) {
          removePendingEntries(successfulLocalIds);
        }

        if (results.length !== entriesToSync.length) {
          toast.error('Synksvaret var ofullständigt. Osäkra rader ligger kvar i kön.');
        }

        queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
        queryClient.invalidateQueries({ queryKey: ['week'] });
        queryClient.invalidateQueries({ queryKey: ['weekLocks'] });
        queryClient.invalidateQueries({ queryKey: ['team-week-summary'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['project'] });
        queryClient.invalidateQueries({ queryKey: ['report'] });
      } catch (error) {
        console.error('Sync failed:', error);
        const signature = error instanceof Error ? error.message : 'Okänt synkfel';
        if (signature !== lastFailureSignature.current) {
          toast.error(`Kunde inte synka offlinekö: ${signature}`);
          lastFailureSignature.current = signature;
        }

        if (!retryTimer.current) {
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = undefined;
            setRetryNonce((value) => value + 1);
          }, 5000);
        }
      } finally {
        syncing.current = false;
      }
    };

    const timeout = window.setTimeout(sync, 1000);
    return () => window.clearTimeout(timeout);
  }, [isOnline, ownedPendingEntries, queryClient, removePendingEntries, retryNonce, user]);

  useEffect(() => () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
  }, []);
}
