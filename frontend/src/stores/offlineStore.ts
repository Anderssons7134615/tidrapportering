import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PendingEntry {
  localId: string;
  ownerUserId: string;
  userId?: string;
  projectId?: string | null;
  activityId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  hours: number;
  billable: boolean;
  note?: string;
  gpsLat?: number;
  gpsLng?: number;
  createdAt: string;
}

interface OfflineState {
  pendingEntries: PendingEntry[];
  isOnline: boolean;
  addPendingEntry: (entry: Omit<PendingEntry, 'localId' | 'createdAt'>) => void;
  removePendingEntries: (localIds: string[]) => void;
  clearPendingEntries: () => void;
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
      clearPendingEntries: () => set({ pendingEntries: [] }),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'tidapp-offline',
      version: 1,
      migrate: (persistedState: any, version) => {
        if (version < 1 && Array.isArray(persistedState?.pendingEntries) && persistedState.pendingEntries.length > 0) {
          localStorage.setItem('tidapp-offline-legacy-backup', JSON.stringify(persistedState.pendingEntries));
          return { ...persistedState, pendingEntries: [] };
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
