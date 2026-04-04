import { Skeleton } from "@/components/ui/skeleton"

const MOCK_BENCH_TOTAL = 3
const MOCK_RUNNING = 1

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-heading text-xl font-semibold">Dashboard</h2>
      <p className="text-muted-foreground text-sm">
        {MOCK_BENCH_TOTAL} benches · {MOCK_RUNNING} running
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div
            key={key}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/10"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="mt-2 flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
