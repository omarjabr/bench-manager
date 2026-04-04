import type { BenchStatus } from "@/lib/api"

const BENCH_WS_URL = "ws://localhost:8000/ws/benches"

export type BenchStatusEvent = {
  bench_name: string
  status: BenchStatus
  pid?: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isBenchStatus(value: unknown): value is BenchStatus {
  return value === "running" || value === "stopped" || value === "unknown"
}

function parseBenchStatusEvent(raw: unknown): BenchStatusEvent | null {
  if (!isRecord(raw)) return null
  const name = raw.bench_name
  const status = raw.status
  if (typeof name !== "string" || !isBenchStatus(status)) return null
  const out: BenchStatusEvent = { bench_name: name, status }
  const pid = raw.pid
  if (pid === null || typeof pid === "number") {
    out.pid = pid
  }
  return out
}

/**
 * Opens a WebSocket to the bench status broadcast endpoint, invokes `onMessage`
 * for each valid JSON payload, and reconnects with exponential backoff (cap 30s).
 */
export function createBenchSocket(
  onMessage: (data: BenchStatusEvent) => void,
  onError?: () => void
): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  const clearTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (closed) return
    const baseMs = 1000
    const maxMs = 30000
    const delayMs = Math.min(maxMs, baseMs * 2 ** attempt)
    attempt += 1
    clearTimer()
    reconnectTimer = setTimeout(connect, delayMs)
  }

  const connect = () => {
    if (closed) return
    clearTimer()
    ws = new WebSocket(BENCH_WS_URL)

    ws.onopen = () => {
      attempt = 0
    }

    ws.onmessage = (event: MessageEvent<string | ArrayBuffer | Blob>) => {
      if (typeof event.data !== "string") return
      try {
        const parsed: unknown = JSON.parse(event.data)
        const payload = parseBenchStatusEvent(parsed)
        if (payload !== null) onMessage(payload)
      } catch {
        onError?.()
      }
    }

    ws.onerror = () => {
      onError?.()
    }

    ws.onclose = () => {
      ws = null
      if (!closed) scheduleReconnect()
    }
  }

  connect()

  return () => {
    closed = true
    clearTimer()
    if (ws !== null) {
      ws.close()
      ws = null
    }
  }
}
