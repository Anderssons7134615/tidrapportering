import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OfflineSyncEntry } from '../types';

export interface PendingEntry extends OfflineSyncEntry {
  syncError?: string;
  syncErrorCode?: string;
  createdAt: string;
}

interface OfflineState {
  pendingEntries: PendingEntry[];
  isOnline: boolean;
  addPendingEntry: (entry: Omit<PendingEntry, 'localId' | 'createdAt'>) => void;
  removePendingEntries: (localIds: string[]) => void;
  markPendingEntriesFailed: (failures: Array<{ localId: string; error: string; code?: string }>) => void;
  retryPendingEntries: (localIds?: string[]) => void;
  setOnline: (online: boolean) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      pendingEntries: [],
      isOnline: navigator.onLine,
      addPendingEntry: (entry) =>
        set((state) => ({
          pendingEntries: [
            ...state.pendingEntries,
            {
              ...entry,
              localId: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      removePendingEntries: (localIds) =>
        set((state) => ({
          pendingEntries: state.pendingEntries.filter((entry) => !localIds.includes(entry.localId)),
        })),
      markPendingEntriesFailed: (failures) => {
        const failureById = new Map(failures.map((failure) => [failure.localId, failure]));
        set((state) => ({
          pendingEntries: state.pendingEntries.map((entry) => {
            const failure = failureById.get(entry.localId);
            return failure
              ? { ...entry, syncError: failure.error, syncErrorCode: failure.code }
              : entry;
          }),
        }));
      },
      retryPendingEntries: (localIds) =>
        set((state) => ({
          pendingEntries: state.pendingEntries.map((entry) => (
            (!localIds || localIds.includes(entry.localId)) && entry.syncErrorCode !== 'LEGACY_SYNC_REQUIRES_REVIEW'
              ? { ...entry, syncError: undefined, syncErrorCode: undefined }
              : entry
          )),
        })),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'tidapp-offline',
      version: 2,
      migrate: (persistedState: any, version) => {
        if (version < 2 && Array.isArray(persistedState?.pendingEntries) && persistedState.pendingEntries.length > 0) {
          return {
            ...persistedState,
            pendingEntries: persistedState.pendingEntries.map((entry: PendingEntry) => ({
              ...entry,
              syncError: 'Den här offline-raden skapades före den säkra synkningen. Den sparas här men måste kontrolleras manuellt för att undvika dubbletter.',
              syncErrorCode: 'LEGACY_SYNC_REQUIRES_REVIEW',
            })),
          };
        }
        return persistedState;
      },
    }
  )
);

// Lyssna på nätverksstatus
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useOfflineStore.getState().setOnline(true));
  window.addEventListener('offline', () => useOfflineStore.getState().setOnline(false));
}
