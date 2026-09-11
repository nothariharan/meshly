/**
 * Ambiguous timeout: the side effect may or may not have landed.
 * Meshly records UNKNOWN and refuses to retry until independent verification.
 */
export class AmbiguousTimeoutError extends Error {
  readonly outcome = "UNKNOWN" as const

  constructor(message = "Network connection disappeared before an outcome was observed") {
    super(message)
    this.name = "AmbiguousTimeoutError"
  }
}

export async function withAmbiguousTimeout<T>(
  work: Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return work
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AmbiguousTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
