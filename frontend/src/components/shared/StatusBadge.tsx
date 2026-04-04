import type { BenchStatus } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const LABELS: Record<BenchStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  unknown: "Unknown",
}

const DOT_COLORS: Record<BenchStatus, string> = {
  running: "bg-emerald-500",
  stopped: "bg-muted-foreground",
  unknown: "bg-amber-400",
}

type StatusBadgeProps = {
  status: BenchStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-border font-normal text-foreground",
        className
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", DOT_COLORS[status])}
        aria-hidden
      />
      {LABELS[status]}
    </Badge>
  )
}
