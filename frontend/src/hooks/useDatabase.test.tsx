import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useDatabaseStatus, useDatabases } from "./useDatabase"

vi.mock("@/lib/api", () => ({
  getDatabaseStatus: vi.fn().mockResolvedValue({
    connected: true,
    host: "127.0.0.1",
    user: "root",
  }),
  getDatabases: vi.fn().mockResolvedValue(["app_db"]),
}))

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe("useDatabase", () => {
  it("useDatabaseStatus returns connection info", async () => {
    const { result } = renderHook(() => useDatabaseStatus(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.connected).toBe(true)
  })

  it("useDatabases runs when status is connected", async () => {
    const { result } = renderHook(() => useDatabases(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(["app_db"])
  })
})
