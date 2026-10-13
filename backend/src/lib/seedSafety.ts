export function assertDestructiveSeedAllowed(environment: NodeJS.ProcessEnv) {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Återställnings-seed är endast tillåtet med NODE_ENV=development.');
  }
  if (environment.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Återställnings-seed kräver ALLOW_DESTRUCTIVE_SEED=true i en lokal utvecklingsmiljö.');
  }
}

export function assertNoDurableTimeHistory(receiptCount: number) {
  if (receiptCount > 0) {
    throw new Error('Databasen har bestående tidskvitton och får inte återställas med seed. Skapa en ny tom lokal testdatabas; bevara befintlig historik.');
  }
}
