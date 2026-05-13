import { useQuery } from "@tanstack/react-query"

import { getSettings } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

export function useSettings() {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["settings", serverId],
    queryFn: () => getSettings(serverId),
    staleTime: 60_000,
  })
}
