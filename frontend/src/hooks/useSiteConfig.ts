import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  getApiErrorMessage,
  getSiteConfig,
  updateSiteConfig,
} from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

/**
 * Fetch a site's config split into editable and readonly sections.
 */
export function useSiteConfig(benchName: string, siteName: string) {
  const serverId = useUiStore((s) => s.currentServerId)

  return useQuery({
    queryKey: ["site-config", benchName, siteName, serverId],
    queryFn: () => getSiteConfig(benchName, siteName, serverId),
    enabled: benchName.length > 0 && siteName.length > 0,
    staleTime: 15_000,
  })
}

/**
 * Mutation to update editable keys in a site's config.
 */
export function useUpdateSiteConfig(benchName: string, siteName: string) {
  const serverId = useUiStore((s) => s.currentServerId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      updateSiteConfig(benchName, siteName, values, serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["site-config", benchName, siteName, serverId],
      })
      toast.success("Site config updated")
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err))
    },
  })
}
