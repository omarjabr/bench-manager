import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BenchSummary } from "@/lib/api"

const createBenchSocketMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/ws", () => ({
  createBenchSocket: createBenchSocketMock,
}))

import { useBenchSocket } from "./useBenchSocket"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    },
  }
}

describe("useBenchSocket", () => {
  afterEach(() => {
    createBenchSocketMock.mockReset()
  })

  it("calls createBenchSocket on mount and disconnect on unmount", async () => {
    const disconnect = vi.fn()
    createBenchSocketMock.mockReturnValue(disconnect)

    const { unmount } = renderHook(() => useBenchSocket(), {
      wrapper: createWrapper().wrapper,
    })

    await waitFor(() => expect(createBenchSocketMock).toHaveBeenCalledTimes(1))

    unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it("merges WebSocket bench rows into the benches query cache", async () => {
    const disconnect = vi.fn()
    let onMessage: ((data: { benches: { name: string; status: string; pid: number | null }[] }) => void) | undefined

    createBenchSocketMock.mockImplementation((options: { onMessage: typeof onMessage }) => {
      onMessage = options.onMessage
      return disconnect
    })

    const { queryClient, wrapper } = createWrapper()
    const initial: BenchSummary[] = [
      {
        name: "bench-a",
        path: "/x/bench-a",
        frappe_version: "15",
        status: "stopped",
        site_count: 1,
        app_count: 2,
      },
    ]
    queryClient.setQueryData(["benches"], initial)

    renderHook(() => useBenchSocket(), { wrapper })

    await waitFor(() => expect(onMessage).toBeDefined())

    onMessage?.({
      benches: [{ name: "bench-a", status: "running", pid: 4242 }],
    })

    await waitFor(() => {
      const data = queryClient.getQueryData<BenchSummary[]>(["benches"])
      expect(data?.[0]?.status).toBe("running")
      expect(data?.[0]?.pid).toBe(4242)
      expect(data?.[0]?.path).toBe("/x/bench-a")
    })
  })
})
