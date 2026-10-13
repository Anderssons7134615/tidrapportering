import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OfflineSyncEntry } from '../types';
import type { TimeWriteOperation } from '../types/timeWrite';

export interface PendingEntry extends OfflineSyncEntry {
  ownerCompanyId?: string;
  write?: TimeWriteOperation;
  retryAt?: number;
  attempts?: number;
  retryable?: boolean;
  mayHaveCommitted?: boolean;
  syncError?: string;
  syncErrorCode?: string;
  createdAt: string;
}

interface OfflineState {
  pendingEntries: PendingEntry[];
  isOnline: boolean;
  addPendingEntry: (entry: Omit<PendingEntry, 'localId' | 'createdAt'>) => void;
  addOperation: (entry: Omit<PendingEntry, 'localId' | 'createdAt'>) => PendingEntry;
  updateOperation: (id: string, patch: Partial<Pick<PendingEntry, 'syncError' | 'syncErrorCode' | 'retryAt' | 'attempts' | 'retryable' | 'mayHaveCommitted'>>) => void;
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
      addOperation: (entry) => {
        const row = { ...entry, localId: crypto.randomUUID(), createdAt: new Date().toISOString() };
        // Persist BEFORE sending. Storage failure must leave the form intact.
        const state = useOfflineStore.getState();
        const pendingEntries = [...state.pendingEntries, row];
        localStorage.setItem('tidapp-offline', JSON.stringify({ version: 3, state: { pendingEntries, isOnline: state.isOnline } }));
        set({ pendingEntries });
        return row;
      },
      updateOperation: (id, patch) => set(state => ({ pendingEntries: state.pendingEntries.map(row => row.localId === id ? { ...row, ...patch } : row) })),
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
            (!localIds || localIds.includes(entry.localId)) && entry.retryable !== false && entry.syncErrorCode !== 'LEGACY_SYNC_REQUIRES_REVIEW'
              ? { ...entry, syncError: undefined, syncErrorCode: undefined, retryAt: undefined }
              : entry
          )),
        })),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'tidapp-offline',
      version: 3,
      partialize: (state) => ({ pendingEntries: state.pendingEntries }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<OfflineState>), isOnline: navigator.onLine }),
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
