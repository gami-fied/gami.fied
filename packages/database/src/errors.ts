const UNIQUE_VIOLATION = '23505';

/**
 * True when a Postgres unique constraint rejected a write. Drizzle wraps driver errors in
 * `DrizzleQueryError`, so the SQLSTATE sits on `cause` rather than on the error itself.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current = error as { code?: unknown; cause?: unknown } | null | undefined;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === UNIQUE_VIOLATION) return true;
    current = current.cause as typeof current;
  }
  return false;
}
