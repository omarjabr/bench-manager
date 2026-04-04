import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BenchSummary } from "@/lib/api"

const getBenchesMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getBenches: getBenchesMock,
}))

import { useBenches } from "./useBenches"

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

describe("useBenches", () => {
  beforeEach(() => {
    getBenchesMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns bench list data from getBenches", async () => {
    const payload: BenchSummary[] = [
      {
        name: "bench-a",
        path: "/tmp/bench-a",
        frappe_version: "15",
        status: "running",
        site_count: 1,
        app_count: 3,
      },
    ]
    getBenchesMock.mockResolvedValue(payload)

    const { result } = renderHook(() => useBenches(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(payload)
    expect(getBenchesMock).toHaveBeenCalledTimes(1)
  })

  it("refetches when the interval elapses", async () => {
    getBenchesMock.mockResolvedValue([])

    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { result } = renderHook(() => useBenches(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getBenchesMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)

    await waitFor(() => expect(getBenchesMock).toHaveBeenCalledTimes(2))
  })
})
