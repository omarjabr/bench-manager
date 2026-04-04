import { useQuery } from "@tanstack/react-query"

import { getBenches } from "@/lib/api"

export function useBenches() {
  return useQuery({
    queryKey: ["benches"],
    queryFn: getBenches,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}
