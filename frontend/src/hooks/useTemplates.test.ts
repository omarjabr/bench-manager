import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Template } from "@/lib/api"

const getTemplatesMock = vi.hoisted(() => vi.fn())
const deleteTemplateMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    getTemplates: getTemplatesMock,
    deleteTemplate: deleteTemplateMock,
  }
})

import { useDeleteTemplate, useTemplates } from "./useTemplates"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  return {
    queryClient,
    invalidateSpy,
    Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    },
  }
}

describe("useTemplates", () => {
  beforeEach(() => {
    getTemplatesMock.mockReset()
    deleteTemplateMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns template list data from getTemplates", async () => {
    const payload: Template[] = [
      {
        id: "a",
        name: "Stack",
        frappe_version: "version-15",
        apps: [{ name: "ERPNext", repo_url: "https://github.com/frappe/erpnext" }],
        created_at: "2026-01-01T00:00:00Z",
        last_used_at: null,
      },
    ]
    getTemplatesMock.mockResolvedValue(payload)

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useTemplates(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(payload)
    expect(getTemplatesMock).toHaveBeenCalledTimes(1)
  })

  it("useDeleteTemplate invalidates templates query on success", async () => {
    getTemplatesMock.mockResolvedValue([])
    deleteTemplateMock.mockResolvedValue(undefined)

    const { Wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useDeleteTemplate(), {
      wrapper: Wrapper,
    })

    await result.current.mutateAsync("id-1")

    expect(deleteTemplateMock).toHaveBeenCalledWith("id-1")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["templates"] })
  })
})
