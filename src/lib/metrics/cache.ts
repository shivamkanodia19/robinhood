import type { StockMetricsPayload } from "./types";

const memory = new Map<string, { at: number; data: StockMetricsPayload }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedMetrics(ticker: string): StockMetricsPayload | null {
  const k = ticker.toUpperCase();
  const hit = memory.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    memory.delete(k);
    return null;
  }
  return hit.data;
}

export function setCachedMetrics(ticker: string, data: StockMetricsPayload): void {
  memory.set(ticker.toUpperCase(), { at: Date.now(), data });
}

export function cacheStats(): { entries: number } {
  return { entries: memory.size };
}
