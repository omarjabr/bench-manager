import { PlayIcon, RefreshIcon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"

import { AppList } from "@/components/bench/AppList"
import { BenchStatus } from "@/components/bench/BenchStatus"
import { SiteList } from "@/components/bench/SiteList"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBench } from "@/hooks/useBench"
import {
  getApiErrorMessage,
  restartBench,
  startBench,
  stopBench,
} from "@/lib/api"

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Failed to load bench"
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function TabPanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export default function BenchDetail() {
  const { name: rawName } = useParams()
  const queryClient = useQueryClient()
  const benchName = useMemo(() => {
    if (rawName === undefined || rawName.length === 0) {
      return ""
    }
    try {
      return decodeURIComponent(rawName)
    } catch {
      return rawName
    }
  }, [rawName])

  const { data, isLoading, isError, error, refetch } = useBench(benchName)
  const [control, setControl] = useState<
    "start" | "stop" | "restart" | null
  >(null)

  const handleStart = async () => {
    if (benchName.length === 0) {
      return
    }
    setControl("start")
    try {
      await startBench(benchName)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
      await queryClient.invalidateQueries({ queryKey: ["benches"] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setControl(null)
    }
  }

  const handleStop = async () => {
    if (benchName.length === 0) {
      return
    }
    setControl("stop")
    try {
      await stopBench(benchName)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
      await queryClient.invalidateQueries({ queryKey: ["benches"] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setControl(null)
    }
  }

  const handleRestart = async () => {
    if (benchName.length === 0) {
      return
    }
    setControl("restart")
    try {
      await restartBench(benchName)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
      await queryClient.invalidateQueries({ queryKey: ["benches"] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setControl(null)
    }
  }

  if (benchName.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">Invalid bench name.</p>
        <Link
          to="/"
          className="text-primary w-fit text-sm underline-offset-4 hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (isError && isNotFoundError(error)) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Bench not found</h2>
        <p className="text-muted-foreground text-sm">
          No bench matches this name. It may have been removed or the name is
          incorrect.
        </p>
        <Link
          to="/"
          className="text-primary w-fit text-sm underline-offset-4 hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (isError && !isNotFoundError(error)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load bench</AlertTitle>
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
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">
          {isLoading ? <Skeleton className="h-7 w-48" /> : data?.name}
        </h2>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="apps">Apps</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          {isLoading ? (
            <OverviewSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <BenchStatus status={data.status} />
                <div className="flex flex-wrap gap-2">
                  {data.status === "stopped" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={control !== null}
                      onClick={() => void handleStart()}
                    >
                      {control === "start" ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={PlayIcon} className="size-4" />
                      )}
                      Start
                    </Button>
                  ) : null}
                  {data.status === "running" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      disabled={control !== null}
                      onClick={() => void handleStop()}
                    >
                      {control === "stop" ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={StopIcon} className="size-4" />
                      )}
                      Stop
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={control !== null}
                    onClick={() => void handleRestart()}
                  >
                    {control === "restart" ? (
                      <Spinner className="size-4" />
                    ) : (
                      <HugeiconsIcon icon={RefreshIcon} className="size-4" />
                    )}
                    Restart
                  </Button>
                </div>
              </div>

              <dl className="grid max-w-xl gap-2 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-muted-foreground">Path</dt>
                <dd className="break-all font-mono text-xs">{data.path}</dd>
                <dt className="text-muted-foreground">Frappe version</dt>
                <dd>{data.frappe_version}</dd>
                <dt className="text-muted-foreground">Python version</dt>
                <dd className="text-muted-foreground">—</dd>
                <dt className="text-muted-foreground">PID</dt>
                <dd>
                  {data.pid !== null ? (
                    String(data.pid)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </dl>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Ports</h3>
                {Object.keys(data.ports).length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No port assignments found in Procfile.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Process</TableHead>
                        <TableHead>Port</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(data.ports).map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium">{key}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="sites" className="mt-4">
          {isLoading ? <TabPanelSkeleton /> : data ? <SiteList sites={data.sites} /> : null}
        </TabsContent>
        <TabsContent value="apps" className="mt-4">
          {isLoading ? <TabPanelSkeleton /> : data ? <AppList apps={data.apps} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
