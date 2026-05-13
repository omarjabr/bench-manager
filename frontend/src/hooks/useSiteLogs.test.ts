import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LogFileInfo, LogTailResponse } from "@/lib/api"

const getSiteLogFilesMock = vi.hoisted(() => vi.fn())
const getSiteLogTailMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getSiteLogFiles: getSiteLogFilesMock,
  getSiteLogTail: getSiteLogTailMock,
}))

import { useSiteLogFiles, useSiteLogTail } from "./useSiteLogs"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe("useSiteLogFiles", () => {
  beforeEach(() => {
    getSiteLogFilesMock.mockReset()
  })

  it("fetches log file list", async () => {
    const payload: LogFileInfo[] = [
      { name: "web.log", size: 1024, modified_at: 1700000000 },
      { name: "worker.log", size: 512, modified_at: 1700000100 },
    ]
    getSiteLogFilesMock.mockResolvedValue(payload)

    const { result } = renderHook(
      () => useSiteLogFiles("my-bench", "site.localhost"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(payload)
    expect(getSiteLogFilesMock).toHaveBeenCalledWith(
      "my-bench",
      "site.localhost",
    )
  })

  it("is disabled with empty bench name", () => {
    const { result } = renderHook(
      () => useSiteLogFiles("", "site.localhost"),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
  })
})

describe("useSiteLogTail", () => {
  beforeEach(() => {
    getSiteLogTailMock.mockReset()
  })

  it("fetches the last N lines of a log file", async () => {
    const payload: LogTailResponse = {
      filename: "web.log",
      lines: ["line1", "line2", "line3"],
      count: 3,
    }
    getSiteLogTailMock.mockResolvedValue(payload)

    const { result } = renderHook(
      () => useSiteLogTail("my-bench", "site.localhost", "web.log", 100),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(payload)
  })

  it("is disabled with empty filename", () => {
    const { result } = renderHook(
      () => useSiteLogTail("bench", "site", ""),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
  })
})
