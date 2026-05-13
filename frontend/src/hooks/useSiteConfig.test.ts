import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteConfigResponse } from "@/lib/api"

const getSiteConfigMock = vi.hoisted(() => vi.fn())
const updateSiteConfigMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getSiteConfig: getSiteConfigMock,
  updateSiteConfig: updateSiteConfigMock,
  getApiErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : "Unknown",
}))

import { useSiteConfig, useUpdateSiteConfig } from "./useSiteConfig"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe("useSiteConfig", () => {
  beforeEach(() => {
    getSiteConfigMock.mockReset()
  })

  it("fetches site config split into editable and readonly", async () => {
    const payload: SiteConfigResponse = {
      editable: { developer_mode: 1, host_name: "mysite.localhost" },
      readonly: { db_name: "_mydb" },
    }
    getSiteConfigMock.mockResolvedValue(payload)

    const { result } = renderHook(
      () => useSiteConfig("my-bench", "mysite.localhost"),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(payload)
    expect(getSiteConfigMock).toHaveBeenCalledWith(
      "my-bench",
      "mysite.localhost",
    )
  })

  it("is disabled with empty bench name", () => {
    const { result } = renderHook(
      () => useSiteConfig("", "site.localhost"),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
  })
})

describe("useUpdateSiteConfig", () => {
  beforeEach(() => {
    updateSiteConfigMock.mockReset()
  })

  it("calls updateSiteConfig and returns updated config", async () => {
    const response: SiteConfigResponse = {
      editable: { developer_mode: 0 },
      readonly: { db_name: "_mydb" },
    }
    updateSiteConfigMock.mockResolvedValue(response)

    const { result } = renderHook(
      () => useUpdateSiteConfig("my-bench", "mysite.localhost"),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ developer_mode: 0 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(updateSiteConfigMock).toHaveBeenCalledWith(
      "my-bench",
      "mysite.localhost",
      { developer_mode: 0 },
    )
  })
})
