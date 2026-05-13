import "@testing-library/jest-dom/vitest"

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ServerRecord } from "@/lib/api"

const getServersMock = vi.hoisted(() => vi.fn())
const createServerMock = vi.hoisted(() => vi.fn())
const deleteServerMock = vi.hoisted(() => vi.fn())
const connectServerMock = vi.hoisted(() => vi.fn())
const disconnectServerMock = vi.hoisted(() => vi.fn())
const updateServerMock = vi.hoisted(() => vi.fn())
const deployServerAgentMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  getServers: getServersMock,
  createServer: createServerMock,
  deleteServer: deleteServerMock,
  connectServer: connectServerMock,
  disconnectServer: disconnectServerMock,
  updateServer: updateServerMock,
  deployServerAgent: deployServerAgentMock,
  getApiErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : "Unknown",
}))

import {
  useServers,
  useCreateServer,
  useDeleteServer,
  useConnectServer,
  useDeployAgent,
  useDisconnectServer,
} from "./useServers"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe("useServers", () => {
  beforeEach(() => {
    getServersMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns server list from getServers", async () => {
    const payload: ServerRecord[] = [
      {
        id: "local",
        nickname: "Local",
        host: "127.0.0.1",
        ssh_user: "",
        ssh_key_path: "",
        remote_agent_port: 0,
        local_tunnel_port: null,
        status: "connected",
        last_connected_at: null,
        agent_version: null,
        created_at: null,
      },
    ]
    getServersMock.mockResolvedValue(payload)

    const { result } = renderHook(() => useServers(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(payload)
    expect(getServersMock).toHaveBeenCalledTimes(1)
  })
})

describe("useCreateServer", () => {
  beforeEach(() => {
    createServerMock.mockReset()
  })

  it("calls createServer and succeeds", async () => {
    const created: ServerRecord = {
      id: "staging",
      nickname: "Staging",
      host: "staging.example.com",
      ssh_user: "deploy",
      ssh_key_path: "",
      remote_agent_port: 8765,
      local_tunnel_port: null,
      status: "disconnected",
      last_connected_at: null,
      agent_version: null,
      created_at: "2025-01-01T00:00:00Z",
    }
    createServerMock.mockResolvedValue(created)

    const { result } = renderHook(() => useCreateServer(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      id: "staging",
      nickname: "Staging",
      host: "staging.example.com",
      ssh_user: "deploy",
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(createServerMock).toHaveBeenCalledTimes(1)
  })
})

describe("useConnectServer", () => {
  beforeEach(() => {
    connectServerMock.mockReset()
  })

  it("calls connectServer", async () => {
    const server: ServerRecord = {
      id: "staging",
      nickname: "Staging",
      host: "staging.example.com",
      ssh_user: "deploy",
      ssh_key_path: "",
      remote_agent_port: 8765,
      local_tunnel_port: 54321,
      status: "connected",
      last_connected_at: "2025-01-01T00:00:00Z",
      agent_version: null,
      created_at: "2025-01-01T00:00:00Z",
    }
    connectServerMock.mockResolvedValue(server)

    const { result } = renderHook(() => useConnectServer(), {
      wrapper: createWrapper(),
    })

    result.current.mutate("staging")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(connectServerMock).toHaveBeenCalledWith("staging")
  })
})

describe("useDeployAgent", () => {
  beforeEach(() => {
    deployServerAgentMock.mockReset()
  })

  it("calls deployServerAgent and returns operation_id", async () => {
    deployServerAgentMock.mockResolvedValue({ operation_id: "op-abc123" })

    const { result } = renderHook(() => useDeployAgent(), {
      wrapper: createWrapper(),
    })

    result.current.mutate("holdco")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deployServerAgentMock).toHaveBeenCalledWith("holdco")
    expect(result.current.data).toEqual({ operation_id: "op-abc123" })
  })
})
