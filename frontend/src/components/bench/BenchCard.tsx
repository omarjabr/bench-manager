import { PlayIcon, StopIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { BenchStatus } from "@/components/bench/BenchStatus"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  getApiErrorMessage,
  startBench,
  stopBench,
  type BenchSummary,
} from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

type BenchCardProps = {
  bench: BenchSummary
}

function truncatePath(path: string, maxLen = 52): string {
  if (path.length <= maxLen) {
    return path
  }
  return `${path.slice(0, maxLen - 1)}…`
}

export function BenchCard({ bench }: BenchCardProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | null>(
    null
  )

  const handleStart = async () => {
    setActionLoading("start")
    try {
      await startBench(bench.name, serverId)
      await queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      await queryClient.invalidateQueries({ queryKey: ["bench", bench.name, serverId] })
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async () => {
    setActionLoading("stop")
    try {
      await stopBench(bench.name, serverId)
      await queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      await queryClient.invalidateQueries({ queryKey: ["bench", bench.name, serverId] })
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setActionLoading(null)
    }
  }

  const openDetail = () => {
    navigate(`/benches/${encodeURIComponent(bench.name)}`)
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-heading text-base tracking-tight">
            {bench.name}
          </CardTitle>
          <BenchStatus status={bench.status} />
        </div>
        <p
          className="text-muted-foreground truncate text-xs"
          title={bench.path}
        >
          {truncatePath(bench.path)}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pb-2 text-sm">
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {bench.site_count} {bench.site_count === 1 ? "site" : "sites"}
          </span>
          <span>
            {bench.app_count} {bench.app_count === 1 ? "app" : "apps"}
          </span>
        </div>
        <p className="text-foreground">
          <span className="text-muted-foreground">Frappe </span>
          {bench.frappe_version}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 border-t bg-muted/50 pt-3">
        <div className="flex items-center gap-1">
          {bench.status === "stopped" ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8"
              aria-label="Start bench"
              disabled={actionLoading !== null}
              onClick={() => void handleStart()}
            >
              {actionLoading === "start" ? (
                <Spinner className="size-4" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} className="size-4" />
              )}
            </Button>
          ) : null}
          {bench.status === "running" ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8"
              aria-label="Stop bench"
              disabled={actionLoading !== null}
              onClick={() => void handleStop()}
            >
              {actionLoading === "stop" ? (
                <Spinner className="size-4" />
              ) : (
                <HugeiconsIcon icon={StopIcon} className="size-4" />
              )}
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Open bench detail"
          onClick={openDetail}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
