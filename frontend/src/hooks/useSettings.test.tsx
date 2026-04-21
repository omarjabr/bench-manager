import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useSettings } from "./useSettings"

vi.mock("@/lib/api", () => ({
  getSettings: vi.fn().mockResolvedValue({
    root_scan_dir: "/tmp",
    excluded_paths: [],
    scan_interval_seconds: 60,
    backend_host: "127.0.0.1",
    backend_port: 8000,
    db_host: "127.0.0.1",
    db_user: "root",
    db_password: "",
  }),
}))

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe("useSettings", () => {
  it("fetches settings including database fields", async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.db_host).toBe("127.0.0.1")
    expect(result.current.data?.db_user).toBe("root")
  })
})
