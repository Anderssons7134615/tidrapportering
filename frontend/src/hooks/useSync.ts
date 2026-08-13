import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStore } from '../stores/offlineStore';
import { timeEntriesApi } from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export function useSync() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { pendingEntries, removePendingEntries, markPendingEntriesFailed, isOnline } = useOfflineStore();
  const lastFailureSignature = useRef('');
  const syncing = useRef(false);
  const ownedPendingEntries = useMemo(
    () => pendingEntries.filter((entry) => entry.ownerUserId === user?.id && !entry.syncError),
    [pendingEntries, user?.id]
  );

  useEffect(() => {
    if (!isOnline || !user || ownedPendingEntries.length === 0 || syncing.current) return;

    const sync = async () => {
      syncing.current = true;
      const entriesToSync = [...ownedPendingEntries];
      try {
        const { results } = await timeEntriesApi.sync(entriesToSync);

        const failed = results.filter((result) => result.outcome === 'REJECTED' || result.error);
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
          .filter((result) => ['CREATED', 'REPLAYED'].includes(result.outcome) && result.localId)
          .map((result) => result.localId as string);
        if (successfulLocalIds.length > 0) {
          removePendingEntries(successfulLocalIds);
        }

        const failedById = failed
          .filter((result): result is typeof result & { localId: string } => Boolean(result.localId))
          .map((result) => ({
            localId: result.localId,
            error: result.error || 'Synkningen behöver granskas innan ett nytt försök',
            code: result.code,
          }));
        const respondedIds = new Set(results.map((result) => result.localId).filter(Boolean));
        const missingResults = entriesToSync
          .filter((entry) => !respondedIds.has(entry.localId))
          .map((entry) => ({
            localId: entry.localId,
            error: 'Synksvaret saknade radens resultat. Raden ligger kvar och behöver synkas på nytt.',
            code: 'SYNC_RESPONSE_INCOMPLETE',
          }));
        if (failedById.length || missingResults.length) {
          markPendingEntriesFailed([...failedById, ...missingResults]);
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

        markPendingEntriesFailed(entriesToSync.map((entry) => ({
          localId: entry.localId,
          error: 'Anslutningen bröts innan synkningen bekräftades. Raden ligger kvar och behöver synkas på nytt.',
          code: 'SYNC_CONFIRMATION_MISSING',
        })));
      } finally {
        syncing.current = false;
      }
    };

    const timeout = window.setTimeout(sync, 1000);
    return () => window.clearTimeout(timeout);
  }, [isOnline, markPendingEntriesFailed, ownedPendingEntries, queryClient, removePendingEntries, user]);
}
