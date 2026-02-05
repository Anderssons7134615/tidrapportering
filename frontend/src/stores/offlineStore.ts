import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PendingEntry {
  localId: string;
  projectId?: string;
  activityId: string;
  date: string;
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
  removePendingEntry: (localId: string) => void;
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
      removePendingEntry: (localId) =>
        set((state) => ({
          pendingEntries: state.pendingEntries.filter((e) => e.localId !== localId),
        })),
      clearPendingEntries: () => set({ pendingEntries: [] }),
      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'tidapp-offline',
    }
  )
);

// Lyssna på nätverksstatus
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useOfflineStore.getState().setOnline(true));
  window.addEventListener('offline', () => useOfflineStore.getState().setOnline(false));
}
