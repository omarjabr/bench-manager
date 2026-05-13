import { useQuery } from "@tanstack/react-query"

import { getBenches } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

export function useBenches() {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["benches", serverId],
    queryFn: () => getBenches(serverId),
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}
