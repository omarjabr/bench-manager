import { useQuery } from "@tanstack/react-query"
import axios from "axios"

import { getBench } from "@/lib/api"

export function useBench(name: string) {
  return useQuery({
    queryKey: ["bench", name],
    queryFn: () => getBench(name),
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
