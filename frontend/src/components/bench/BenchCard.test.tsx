import "@testing-library/jest-dom/vitest"

import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import type { BenchSummary } from "@/lib/api"

import { BenchCard } from "./BenchCard"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    startBench: vi.fn(),
    stopBench: vi.fn(),
  }
})

const baseBench: BenchSummary = {
  name: "my-bench",
  path: "/home/dev/projects/my-bench",
  frappe_version: "15.2.0",
  status: "stopped",
  site_count: 2,
  app_count: 4,
}

function renderBench(bench: BenchSummary) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BenchCard bench={bench} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("BenchCard", () => {
  it("renders bench name, path, status, and Frappe version", () => {
    renderBench(baseBench)

    expect(screen.getByText("my-bench")).toBeInTheDocument()
    expect(
      screen.getByText(/\/home\/dev\/projects\/my-bench/)
    ).toBeInTheDocument()
    expect(screen.getByText("Stopped")).toBeInTheDocument()
    expect(screen.getByText("15.2.0")).toBeInTheDocument()
    expect(screen.getByText(/2 sites/)).toBeInTheDocument()
    expect(screen.getByText(/4 apps/)).toBeInTheDocument()
  })

  it("shows Start when status is stopped", () => {
    renderBench({ ...baseBench, status: "stopped" })

    expect(screen.getByRole("button", { name: "Start bench" })).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Stop bench" })
    ).not.toBeInTheDocument()
  })

  it("shows Stop when status is running", () => {
    renderBench({ ...baseBench, status: "running" })

    expect(screen.getByRole("button", { name: "Stop bench" })).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Start bench" })
    ).not.toBeInTheDocument()
  })
})
