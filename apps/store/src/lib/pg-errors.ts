/**
 * Drizzle wraps driver errors, so walk the cause chain for the PG error code.
 * Shared by routes that translate "23505" (unique_violation) into a 409.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current = error as { code?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.code === "string") return current.code;
    current = current.cause as { code?: unknown; cause?: unknown } | undefined;
  }
  return undefined;
}
