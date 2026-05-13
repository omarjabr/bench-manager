import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DatabaseStatus } from "@/lib/api"

const getSiteDatabaseStatusMock = vi.hoisted(() => vi.fn())
const getScopedTablesMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getSiteDatabaseStatus: getSiteDatabaseStatusMock,
  getScopedTables: getScopedTablesMock,
  siteDbScope: (bench: string, site: string) =>
    `/api/benches/${bench}/sites/${site}/database`,
}))

import { useSiteDatabaseStatus, useSiteDatabaseTables } from "./useSiteDatabase"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe("useSiteDatabaseStatus", () => {
  beforeEach(() => {
    getSiteDatabaseStatusMock.mockReset()
  })

  it("fetches database connection status for a site", async () => {
    const payload: DatabaseStatus = {
      connected: true,
      host: "127.0.0.1",
      user: "_mydb",
    }
    getSiteDatabaseStatusMock.mockResolvedValue(payload)

    const { result } = renderHook(
      () => useSiteDatabaseStatus("my-bench", "mysite.localhost"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(payload)
    expect(getSiteDatabaseStatusMock).toHaveBeenCalledWith(
      "my-bench",
      "mysite.localhost",
    )
  })

  it("is disabled with empty site name", () => {
    const { result } = renderHook(
      () => useSiteDatabaseStatus("bench", ""),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
  })
})

describe("useSiteDatabaseTables", () => {
  beforeEach(() => {
    getScopedTablesMock.mockReset()
  })

  it("fetches table list for a site's database", async () => {
    const tables = ["tabDocType", "tabUser", "tabFile"]
    getScopedTablesMock.mockResolvedValue(tables)

    const { result } = renderHook(
      () => useSiteDatabaseTables("my-bench", "mysite.localhost"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(tables)
  })

  it("is disabled when bench or site is empty", () => {
    const { result } = renderHook(
      () => useSiteDatabaseTables("", ""),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
  })
})
