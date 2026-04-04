import type { BenchStatus } from "@/lib/api"

const BENCH_WS_URL = "ws://localhost:8000/ws/benches"

const MAX_RECONNECT_ATTEMPTS = 10

export type BenchStatusRow = {
  name: string
  status: BenchStatus
  pid: number | null
}

export type BenchStatusEvent = {
  benches: BenchStatusRow[]
}

export type CreateBenchSocketOptions = {
  onMessage: (data: BenchStatusEvent) => void
  onError?: () => void
  onConnectionChange?: (connected: boolean) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isBenchStatus(value: unknown): value is BenchStatus {
  return value === "running" || value === "stopped" || value === "unknown"
}

function parseBenchStatusEvent(raw: unknown): BenchStatusEvent | null {
  if (!isRecord(raw)) {
    return null
  }
  const benches = raw.benches
  if (!Array.isArray(benches)) {
    return null
  }
  const rows: BenchStatusRow[] = []
  for (const item of benches) {
    if (!isRecord(item)) {
      return null
    }
    const name = item.name
    const status = item.status
    if (typeof name !== "string" || !isBenchStatus(status)) {
      return null
    }
    const pid = item.pid
    if (pid !== null && typeof pid !== "number") {
      return null
    }
    rows.push({ name, status, pid: pid === undefined ? null : pid })
  }
  return { benches: rows }
}

function safeCloseWebSocket(socket: WebSocket | null): void {
  if (socket === null) {
    return
  }
  if (
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    return
  }
  socket.close()
}

/**
 * Opens a WebSocket to the bench status broadcast endpoint, invokes ``onMessage``
 * for each valid JSON payload, reconnects with exponential backoff (cap 30s),
 * and stops after ``MAX_RECONNECT_ATTEMPTS`` failed connection cycles.
 */
export function createBenchSocket(options: CreateBenchSocketOptions): () => void {
  const { onMessage, onError, onConnectionChange } = options
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
    if (closed) {
      return
    }
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      onError?.()
      return
    }
    const baseMs = 1000
    const maxMs = 30000
    const delayMs = Math.min(maxMs, baseMs * 2 ** attempt)
    attempt += 1
    clearTimer()
    reconnectTimer = setTimeout(connect, delayMs)
  }

  const connect = () => {
    if (closed) {
      return
    }
    clearTimer()
    const socket = new WebSocket(BENCH_WS_URL)
    ws = socket

    socket.onopen = () => {
      if (closed) {
        safeCloseWebSocket(socket)
        return
      }
      attempt = 0
      onConnectionChange?.(true)
    }

    socket.onmessage = (event: MessageEvent<string | ArrayBuffer | Blob>) => {
      if (typeof event.data !== "string") {
        return
      }
      try {
        const parsed: unknown = JSON.parse(event.data)
        const payload = parseBenchStatusEvent(parsed)
        if (payload !== null) {
          onMessage(payload)
        }
      } catch {
        /* ignore malformed frames */
      }
    }

    socket.onerror = () => {
      /* connection failure details arrive via onclose */
    }

    socket.onclose = () => {
      if (ws === socket) {
        ws = null
      }
      if (closed) {
        return
      }
      onConnectionChange?.(false)
      scheduleReconnect()
    }

    if (closed) {
      safeCloseWebSocket(socket)
    }
  }

  connect()

  return () => {
    closed = true
    clearTimer()
    onConnectionChange?.(false)
    const socket = ws
    ws = null
    safeCloseWebSocket(socket)
  }
}
