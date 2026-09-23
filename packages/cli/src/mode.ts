/**
 * Where a command is allowed to execute.
 *
 * Live Solari is the default. The simulator runs only when someone asks for it:
 * `--simulator`, or a project that was initialized with `--provider simulator`.
 * `meshly mcp` ignores the project setting. Cursor's documented config passes a
 * Solari key and does not pass `--simulator`, so a leftover simulator project
 * must not turn that session into a fake live run.
 */

export interface ModeFlags {
  simulator?: string | boolean
  live?: string | boolean
}

export interface ModeStore {
  exists(): boolean
  loadConfig(): { execution?: string }
}

export function projectIsSimulator(store?: ModeStore): boolean {
  return Boolean(store?.exists() && store.loadConfig().execution === "simulator")
}

export function cliUsesSimulator(flags: ModeFlags, store?: ModeStore): boolean {
  if (flags.live) return false
  if (flags.simulator) return true
  return projectIsSimulator(store)
}

export function mcpUsesSimulator(flags: ModeFlags): boolean {
  return Boolean(flags.simulator)
}
