import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  connectServer,
  createServer,
  deleteServer,
  deployServerAgent,
  disconnectServer,
  getApiErrorMessage,
  getServers,
  updateServer,
  type OperationIdResponse,
  type ServerCreatePayload,
  type ServerRecord,
  type ServerUpdatePayload,
} from "@/lib/api"

const SERVERS_KEY = ["servers"] as const

export function useServers() {
  return useQuery({
    queryKey: SERVERS_KEY,
    queryFn: getServers,
    staleTime: 30_000,
  })
}

export function useCreateServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ServerCreatePayload) => createServer(body),
    onSuccess: (created: ServerRecord) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.success(`Server "${created.nickname}" added.`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}

export function useUpdateServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: { serverId: string; body: ServerUpdatePayload }) =>
      updateServer(args.serverId, args.body),
    onSuccess: (updated: ServerRecord) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.success(`Server "${updated.nickname}" updated.`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}

export function useDeleteServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId),
    onSuccess: (_: void, serverId: string) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.success(`Server "${serverId}" deleted.`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}

export function useConnectServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverId: string) => connectServer(serverId),
    onSuccess: (server: ServerRecord) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.success(`Connected to "${server.nickname}".`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}

export function useDisconnectServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverId: string) => disconnectServer(serverId),
    onSuccess: (server: ServerRecord) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.info(`Disconnected from "${server.nickname}".`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}

export function useDeployAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverId: string) => deployServerAgent(serverId),
    onSuccess: (data: OperationIdResponse) => {
      void queryClient.invalidateQueries({ queryKey: SERVERS_KEY })
      toast.success(`Agent deployment started (operation ${data.operation_id}).`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}
