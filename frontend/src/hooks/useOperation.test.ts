import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useOperation } from "./useOperation"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    getOperationsWebSocketUrl: (id: string) => `ws://localhost/ws/operations/${id}`,
  }
})

type MockSocketInstance = {
  url: string
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  close: () => void
  readyState: number
}

const sockets: MockSocketInstance[] = []

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = MockWebSocket.OPEN
  url: string

  constructor(url: string) {
    this.url = url
    sockets.push(this)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
  }
}

describe("useOperation", () => {
  afterEach(() => {
    sockets.length = 0
    vi.unstubAllGlobals()
  })

  it("accumulates log lines and transitions to done with exit code", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket)

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useOperation(id),
      { initialProps: { id: null as string | null } }
    )

    expect(result.current.lines).toEqual([])
    expect(result.current.status).toBe("running")

    await act(async () => {
      rerender({ id: "op-abc" })
    })

    await waitFor(() => expect(sockets.length).toBe(1))
    const socket = sockets[0]

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "log",
          line: "first",
          stream: "stdout",
        }),
      } as MessageEvent<string>)
    })

    expect(result.current.lines).toEqual(["first"])
    expect(result.current.status).toBe("running")

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({ type: "done", exit_code: 0 }),
      } as MessageEvent<string>)
    })

    await waitFor(() => expect(result.current.status).toBe("done"))
    expect(result.current.exitCode).toBe(0)
  })

  it("sets error status when the server sends an error message", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket)

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useOperation(id),
      { initialProps: { id: null as string | null } }
    )

    await act(async () => {
      rerender({ id: "op-err" })
    })

    await waitFor(() => expect(sockets.length).toBe(1))
    const socket = sockets[0]

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "error",
          message: "failed to spawn",
        }),
      } as MessageEvent<string>)
    })

    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.lines.some((l) => l.includes("failed"))).toBe(true)
  })

  it("resets state when operation id becomes null", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket)

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useOperation(id),
      { initialProps: { id: "op-x" as string | null } }
    )

    await waitFor(() => expect(sockets.length).toBe(1))

    await act(async () => {
      rerender({ id: null })
    })

    expect(result.current.lines).toEqual([])
    expect(result.current.exitCode).toBeNull()
  })
})
