import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  getApiErrorMessage,
  getSystemCheckReport,
  postSystemFix,
  type FixGroupId,
  type OperationIdResponse,
  type SystemFixBody,
  type SystemCheckReport,
} from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

export function useSystemCheckReport(enabled = true) {
  const serverId = useUiStore((s) => s.currentServerId)
  return useQuery<SystemCheckReport>({
    queryKey: ["system-check", serverId],
    queryFn: () => getSystemCheckReport(serverId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled,
  })
}

export function useRunSystemFix() {
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)

  return useMutation({
    mutationFn: (args: {
      groupId: FixGroupId
      body: SystemFixBody
    }): Promise<OperationIdResponse> =>
      postSystemFix(args.groupId, args.body, serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system-check", serverId] })
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    },
  })
}
