import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Settings } from "@/lib/api"

const getSettingsMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getSettings: getSettingsMock,
}))

import { useSettings } from "./useSettings"

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

const MOCK_SETTINGS: Settings = {
  root_scan_dir: "/home/user",
  excluded_paths: ["*/venv/*"],
  scan_interval_seconds: 60,
  backend_host: "127.0.0.1",
  backend_port: 8000,
  db_host: "127.0.0.1",
  db_user: "root",
  db_password: "",
  app_registry: [
    {
      name: "ERPNext",
      repo_url: "https://github.com/frappe/erpnext",
      default_branch: "version-15",
    },
    {
      name: "HRMS",
      repo_url: "https://github.com/frappe/hrms",
      default_branch: "version-15",
    },
  ],
}

describe("useSettings", () => {
  beforeEach(() => {
    getSettingsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns settings data including app_registry", async () => {
    getSettingsMock.mockResolvedValue(MOCK_SETTINGS)

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(MOCK_SETTINGS)
    expect(result.current.data?.app_registry).toHaveLength(2)
    expect(result.current.data?.app_registry[0]?.name).toBe("ERPNext")
    expect(getSettingsMock).toHaveBeenCalledTimes(1)
  })

  it("has a staleTime of 60 seconds", async () => {
    getSettingsMock.mockResolvedValue(MOCK_SETTINGS)

    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getSettingsMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(getSettingsMock).toHaveBeenCalledTimes(1)
  })

  it("handles API errors gracefully", async () => {
    getSettingsMock.mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeUndefined()
  })
})
