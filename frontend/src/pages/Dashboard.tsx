import { useMemo } from "react"
import { Link, useOutletContext } from "react-router-dom"

import { BenchCard } from "@/components/bench/BenchCard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBenches } from "@/hooks/useBenches"
import type { BenchSummary } from "@/lib/api"

type AppShellOutletContext = {
  searchQuery: string
  setSearchQuery: (value: string) => void
}

function matchesSearch(bench: BenchSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) {
    return true
  }
  if (bench.name.toLowerCase().includes(q)) {
    return true
  }
  if (bench.path.toLowerCase().includes(q)) {
    return true
  }
  if (bench.frappe_version.toLowerCase().includes(q)) {
    return true
  }
  return false
}

function BenchCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 ring-1 ring-foreground/10">
      <div className="grid gap-1 px-4">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="flex flex-col gap-2 px-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex items-center justify-between border-t bg-muted/50 p-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Failed to load benches"
}

export default function Dashboard() {
  const { searchQuery } = useOutletContext<AppShellOutletContext>()
  const { data, isLoading, isError, error, refetch } = useBenches()

  const filtered = useMemo(() => {
    if (!data) {
      return []
    }
    return data.filter((b) => matchesSearch(b, searchQuery))
  }, [data, searchQuery])

  const total = data?.length ?? 0
  const running = useMemo(() => {
    if (!data) {
      return 0
    }
    return data.filter((b) => b.status === "running").length
  }, [data])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          {total} {total === 1 ? "bench" : "benches"} · {running} running
        </p>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load benches</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span>{getErrorMessage(error)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit shrink-0"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["s1", "s2", "s3"].map((key) => (
            <BenchCardSkeleton key={key} />
          ))}
        </div>
      ) : !isError ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((bench) => (
            <BenchCard key={bench.name} bench={bench} />
          ))}
        </div>
      ) : null}

      {!isLoading && !isError && data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No benches found. Check the scan directory in{" "}
          <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
            Settings
          </Link>
          .
        </p>
      ) : null}

      {!isLoading &&
      !isError &&
      data !== undefined &&
      data.length > 0 &&
      filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No benches match your search.
        </p>
      ) : null}
    </div>
  )
}
