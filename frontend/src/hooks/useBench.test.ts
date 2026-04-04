import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BenchDetail } from "@/lib/api"

const getBenchMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getBench: getBenchMock,
}))

import { useBench } from "./useBench"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe("useBench", () => {
  beforeEach(() => {
    getBenchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns bench detail from getBench", async () => {
    const payload: BenchDetail = {
      name: "bench-a",
      path: "/tmp/bench-a",
      frappe_version: "15",
      status: "stopped",
      site_count: 0,
      app_count: 0,
      sites: [],
      apps: [],
      pid: null,
      ports: {},
    }
    getBenchMock.mockResolvedValue(payload)

    const { result } = renderHook(() => useBench("bench-a"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(payload)
    expect(getBenchMock).toHaveBeenCalledWith("bench-a")
  })

  it("refetches when the interval elapses", async () => {
    const payload: BenchDetail = {
      name: "bench-a",
      path: "/tmp/bench-a",
      frappe_version: "15",
      status: "running",
      site_count: 1,
      app_count: 2,
      sites: [],
      apps: [],
      pid: 1234,
      ports: { web: "8000" },
    }
    getBenchMock.mockResolvedValue(payload)

    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { result } = renderHook(() => useBench("bench-a"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getBenchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)

    await waitFor(() => expect(getBenchMock).toHaveBeenCalledTimes(2))
  })
})
