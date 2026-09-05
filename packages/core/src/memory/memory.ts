/**
 * @meshly/core - Three-Tier Budgeted Memory Engine
 */
import { MemoryRef } from "../types.js"
import { EventStore } from "../events/events.js"

export interface MemoryStats {
  hotTokens: number
  warmTokens: number
  coldTokens: number
  totalTokens: number
  memoryPressurePct: number
}

export class MemoryManager {
  private store: Map<string, MemoryRef> = new Map()
  private maxHotTokens: number
  private events?: EventStore

  constructor(events?: EventStore, maxHotTokens: number = 4000) {
    this.events = events
    this.maxHotTokens = maxHotTokens
  }

  put(params: {
    workerId: string
    key: string
    value: any
    tier?: "hot" | "warm" | "cold"
    tokensEstimate?: number
    source?: string
    confidence?: number
  }): MemoryRef {
    const compositeKey = `${params.workerId}:${params.key}`
    const serialized = typeof params.value === "string" ? params.value : JSON.stringify(params.value)
    const tokenEst = params.tokensEstimate ?? Math.max(1, Math.ceil(serialized.length / 4))

    const entry: MemoryRef = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      key: params.key,
      tier: params.tier ?? "hot",
      value: params.value,
      tokensEstimate: tokenEst,
      updatedAt: Date.now(),
      source: params.source,
      confidence: params.confidence ?? 1.0,
    }

    this.store.set(compositeKey, entry)
    this.enforceHotTierLimits(params.workerId)
    return entry
  }

  get(workerId: string, key: string): MemoryRef | undefined {
    return this.store.get(`${workerId}:${key}`)
  }

  search(params: {
    workerId: string
    query?: string
    maxTokens?: number
    includeTiers?: ("hot" | "warm" | "cold")[]
  }): { items: MemoryRef[]; totalTokens: number; truncated: boolean } {
    const budget = params.maxTokens ?? this.maxHotTokens
    const allowedTiers = params.includeTiers ?? ["hot", "warm"]

    const workerMemories: MemoryRef[] = []
    const prefix = `${params.workerId}:`

    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix) && allowedTiers.includes(v.tier)) {
        if (!params.query || v.key.toLowerCase().includes(params.query.toLowerCase())) {
          workerMemories.push(v)
        }
      }
    }

    const tierPriority = { hot: 0, warm: 1, cold: 2 }
    workerMemories.sort((a, b) => {
      const pDiff = tierPriority[a.tier] - tierPriority[b.tier]
      if (pDiff !== 0) return pDiff
      return b.updatedAt - a.updatedAt
    })

    const selected: MemoryRef[] = []
    let currentTokens = 0
    let truncated = false

    for (const mem of workerMemories) {
      if (currentTokens + mem.tokensEstimate <= budget) {
        selected.push(mem)
        currentTokens += mem.tokensEstimate
      } else {
        truncated = true
        break
      }
    }

    if (this.events) {
      this.events.emit("memory.retrieved", {
        workerId: params.workerId,
        data: { query: params.query, tokensRetrieved: currentTokens, budget, truncated },
      })
    }

    return { items: selected, totalTokens: currentTokens, truncated }
  }

  promote(workerId: string, key: string): boolean {
    return this.setTier(workerId, key, "hot")
  }

  archive(workerId: string, key: string): boolean {
    return this.setTier(workerId, key, "cold")
  }

  setTier(workerId: string, key: string, newTier: "hot" | "warm" | "cold"): boolean {
    const compositeKey = `${workerId}:${key}`
    const mem = this.store.get(compositeKey)
    if (mem) {
      mem.tier = newTier
      mem.updatedAt = Date.now()
      return true
    }
    return false
  }

  pressure(workerId: string): MemoryStats {
    let hot = 0
    let warm = 0
    let cold = 0

    const prefix = `${workerId}:`
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix)) {
        if (v.tier === "hot") hot += v.tokensEstimate
        else if (v.tier === "warm") warm += v.tokensEstimate
        else cold += v.tokensEstimate
      }
    }

    const total = hot + warm + cold
    const pressurePct = Math.min(100, Math.round((hot / this.maxHotTokens) * 100))

    return {
      hotTokens: hot,
      warmTokens: warm,
      coldTokens: cold,
      totalTokens: total,
      memoryPressurePct: pressurePct,
    }
  }

  snapshot(workerId: string): Record<string, any> {
    const snap: Record<string, any> = {}
    const prefix = `${workerId}:`
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix)) {
        snap[v.key] = { tier: v.tier, value: v.value, tokensEstimate: v.tokensEstimate }
      }
    }
    return snap
  }

  private enforceHotTierLimits(workerId: string): void {
    const prefix = `${workerId}:`
    const hotItems: MemoryRef[] = []

    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix) && v.tier === "hot") {
        hotItems.push(v)
      }
    }

    hotItems.sort((a, b) => b.updatedAt - a.updatedAt)

    let totalHotTokens = 0
    for (const item of hotItems) {
      totalHotTokens += item.tokensEstimate
      if (totalHotTokens > this.maxHotTokens) {
        item.tier = "warm"
      }
    }
  }
}
