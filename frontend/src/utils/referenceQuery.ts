export function referenceQueryCache<T>(readCache: () => T | undefined) {
  return {
    initialData: readCache,
    staleTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: 'always' as const,
    refetchOnReconnect: 'always' as const,
  } as const;
}
