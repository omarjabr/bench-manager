import { useQuery } from "@tanstack/react-query"
import axios from "axios"

import { getBench } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

export function useBench(name: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["bench", name, serverId],
    queryFn: () => getBench(name, serverId),
    enabled: name.length > 0,
    staleTime: 10_000,
    refetchInterval: 10_000,
    retry: (_failureCount, error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return false
      }
      return true
    },
  })
}
