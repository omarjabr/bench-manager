import { useEffect, useState } from "react"

import { getOperationsWebSocketUrl } from "@/lib/api"

type OperationStatus = "running" | "done" | "error"

function parseOperationMessage(data: string): unknown {
  try {
    return JSON.parse(data) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Subscribes to ``/ws/operations/{operationId}`` and accumulates streamed log lines
 * until a ``done`` or ``error`` message is received.
 */
export function useOperation(operationId: string | null) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<OperationStatus>("running")
  const [exitCode, setExitCode] = useState<number | null>(null)

  useEffect(() => {
    if (operationId === null) {
      setLines([])
      setStatus("running")
      setExitCode(null)
      return
    }

    setLines([])
    setStatus("running")
    setExitCode(null)

    const url = getOperationsWebSocketUrl(operationId)
    const socket = new WebSocket(url)

    socket.onmessage = (event: MessageEvent<string>) => {
      const parsed = parseOperationMessage(event.data)
      if (!isRecord(parsed) || typeof parsed.type !== "string") {
        return
      }
      if (parsed.type === "log") {
        const line =
          typeof parsed.line === "string" ? parsed.line : String(parsed.line)
        setLines((prev) => [...prev, line])
        return
      }
      if (parsed.type === "done") {
        const code = parsed.exit_code
        setExitCode(typeof code === "number" ? code : Number(code))
        setStatus("done")
        socket.close()
        return
      }
      if (parsed.type === "error") {
        const message =
          typeof parsed.message === "string"
            ? parsed.message
            : "Operation failed"
        setLines((prev) => [...prev, message])
        setStatus("error")
        socket.close()
      }
    }

    socket.onerror = () => {
      setStatus("error")
      setExitCode(null)
    }

    return () => {
      socket.onmessage = null
      socket.onerror = null
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close()
      }
    }
  }, [operationId])

  return { lines, status, exitCode }
}
