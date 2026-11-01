export function parseIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(value)) {
    throw new Error('IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}
