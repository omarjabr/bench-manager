import {
  ChipIcon,
  ComputerTerminal01Icon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Folder02FreeIcons,
  InternetIcon,
  PlayIcon,
  RefreshIcon,
  Settings01Icon,
  StopIcon,
  Store02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"

import { AppList } from "@/components/bench/AppList"
import { BenchStatus } from "@/components/bench/BenchStatus"
import { SiteList } from "@/components/bench/SiteList"
import { LogStream } from "@/components/shared/LogStream"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { NewSiteForm } from "@/components/wizards/NewSiteForm"
import { useBench } from "@/hooks/useBench"
import { useOperation } from "@/hooks/useOperation"
import {
  getApiErrorMessage,
  postOperationGetApp,
  restartBench,
  startBench,
  stopBench,
} from "@/lib/api"
import { getAppDialogFormSchema } from "@/schemas/bench.schema"
import { useUiStore } from "@/stores/ui.store"

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

  const activeOperationId = useUiStore((s) => s.activeOperationId)
  const activeBenchName = useUiStore((s) => s.activeBenchName)
  const setActiveOperationId = useUiStore((s) => s.setActiveOperationId)
  const setActiveBenchStore = useUiStore((s) => s.setActiveBench)

  const showInitLog =
    activeOperationId !== null &&
    activeBenchName !== null &&
    activeBenchName === benchName

  const initOperation = useOperation(showInitLog ? activeOperationId : null)

  useEffect(() => {
    if (!showInitLog) {
      return
    }
    if (initOperation.status === "running") {
      return
    }
    setActiveOperationId(null)
    setActiveBenchStore(null)
    void queryClient.invalidateQueries({ queryKey: ["benches"] })
    void queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
  }, [
    showInitLog,
    initOperation.status,
    benchName,
    queryClient,
    setActiveOperationId,
    setActiveBenchStore,
  ])

  const [control, setControl] = useState<"start" | "stop" | "restart" | null>(
    null
  )
  const [newSiteOpen, setNewSiteOpen] = useState(false)
  const [getAppOpen, setGetAppOpen] = useState(false)
  const [getAppRepoUrl, setGetAppRepoUrl] = useState("")
  const [getAppBranch, setGetAppBranch] = useState("")
  const [getAppRepoError, setGetAppRepoError] = useState<string | null>(null)
  const [getAppOperationId, setGetAppOperationId] = useState<string | null>(
    null
  )
  const getAppStream = useOperation(getAppOperationId)
  const getAppToastOpRef = useRef<string | null>(null)

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

  const handleGetAppOpenChange = (next: boolean) => {
    if (
      !next &&
      getAppOperationId !== null &&
      getAppStream.status === "running"
    ) {
      return
    }
    if (!next) {
      setGetAppRepoUrl("")
      setGetAppBranch("")
      setGetAppRepoError(null)
      setGetAppOperationId(null)
      getAppToastOpRef.current = null
    }
    setGetAppOpen(next)
  }

  const handleGetAppSubmit = async () => {
    setGetAppRepoError(null)
    const branchTrim = getAppBranch.trim()
    const parsed = getAppDialogFormSchema.safeParse({
      repoUrl: getAppRepoUrl.trim(),
      branch: branchTrim.length > 0 ? branchTrim : undefined,
    })
    if (!parsed.success) {
      setGetAppRepoError(
        parsed.error.issues[0]?.message ?? "Invalid input"
      )
      return
    }
    try {
      const payload: {
        bench_name: string
        repo_url: string
        branch?: string
      } = {
        bench_name: benchName,
        repo_url: parsed.data.repoUrl,
      }
      if (
        parsed.data.branch !== undefined &&
        parsed.data.branch.length > 0
      ) {
        payload.branch = parsed.data.branch
      }
      const res = await postOperationGetApp(payload)
      setGetAppOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      getAppStream.status === "done" &&
      getAppStream.exitCode === 0 &&
      getAppOperationId !== null
    ) {
      if (getAppToastOpRef.current === getAppOperationId) {
        return
      }
      getAppToastOpRef.current = getAppOperationId
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
      void queryClient.invalidateQueries({ queryKey: ["benches"] })
      toast.success(
        "App fetched successfully. To install it on a site, use the Install App button on the Sites tab."
      )
    }
  }, [
    getAppStream.status,
    getAppStream.exitCode,
    getAppOperationId,
    queryClient,
    benchName,
  ])

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
        <p className="text-sm text-muted-foreground">Invalid bench name.</p>
        <Link
          to="/"
          className="w-fit text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (isError && isNotFoundError(error) && !showInitLog) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Bench not found</h2>
        <p className="text-sm text-muted-foreground">
          No bench matches this name. It may have been removed or the name is
          incorrect.
        </p>
        <Link
          to="/"
          className="w-fit text-sm text-primary underline-offset-4 hover:underline"
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

  const displayName = data?.name ?? benchName

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">
          {isLoading && !showInitLog ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            displayName
          )}
        </h2>
      </div>

      {data && (
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
      )}

      <Tabs
        defaultValue={activeOperationId !== null ? "logs" : "overview"}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="overview">
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sites">
            <HugeiconsIcon icon={InternetIcon} className="size-4" />
            Sites
          </TabsTrigger>
          <TabsTrigger value="apps">
            <HugeiconsIcon icon={Store02Icon} className="size-4" />
            Apps
          </TabsTrigger>
          <TabsTrigger value="logs">
            <HugeiconsIcon icon={ComputerTerminal01Icon} className="size-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="processes">
            <HugeiconsIcon icon={ChipIcon} className="size-4" />
            Processes
          </TabsTrigger>
          <TabsTrigger value="files">
            <HugeiconsIcon icon={Folder02FreeIcons} className="size-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="database">
            <HugeiconsIcon icon={DatabaseIcon} className="size-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="settings">
            <HugeiconsIcon icon={Settings01Icon} className="size-4" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              The bench directory is being created. Overview details will load
              automatically when discovery finds this bench.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <OverviewSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-6">
              <dl className="grid max-w-xl gap-2 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-muted-foreground">Path</dt>
                <dd className="font-mono text-xs break-all">{data.path}</dd>
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
                  <p className="text-sm text-muted-foreground">
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
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Sites will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewSiteOpen(true)}
                >
                  New Site
                </Button>
              </div>
              <SiteList
                sites={data.sites}
                benchApps={data.apps}
                benchName={data.name}
              />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="apps" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Apps will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setGetAppOpen(true)}
                >
                  Get App
                </Button>
              </div>
              <AppList apps={data.apps} />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <div className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 shadow-md dark:border-zinc-600 dark:bg-zinc-900">
            <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Bench setup in progress
            </p>
            <LogStream
              operationId={activeOperationId ?? "1"}
              lines={initOperation.lines ?? ["test"]}
              status={initOperation.status ?? "null"}
              exitCode={initOperation.exitCode ?? null}
            />
          </div>
          {/* {activeOperationId === null ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                The bench directory is being created. Logs will load
                automatically when discovery finds this bench.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {showInitLog && activeOperationId !== null ? (
                
              ) : null}
            </div>
          )} */}
        </TabsContent>
        <TabsContent value="processes" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Processes will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Processes</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Process</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">bench</TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.pid !== null ? String(data.pid) : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Files will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Files</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Last modified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">bench</TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.pid !== null ? String(data.pid) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.pid !== null ? String(data.pid) : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="database" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Database will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Database</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Database</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">bench</TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.pid !== null ? String(data.pid) : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Settings will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Settings</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Setting</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">bench</TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.pid !== null ? String(data.pid) : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {data ? (
        <NewSiteForm
          open={newSiteOpen}
          onOpenChange={setNewSiteOpen}
          benchName={data.name}
          availableApps={data.apps}
        />
      ) : null}

      <Dialog open={getAppOpen} onOpenChange={handleGetAppOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={
            !(getAppOperationId !== null && getAppStream.status === "running")
          }
          onPointerDownOutside={(event) => {
            if (
              getAppOperationId !== null &&
              getAppStream.status === "running"
            ) {
              event.preventDefault()
            }
          }}
          onEscapeKeyDown={(event) => {
            if (
              getAppOperationId !== null &&
              getAppStream.status === "running"
            ) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Get app</DialogTitle>
            <DialogDescription>
              Clone an app from a Git repository into this bench using{" "}
              <span className="font-mono text-xs">bench get-app</span>.
            </DialogDescription>
          </DialogHeader>
          {getAppOperationId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="get-app-repo">Repository URL</Label>
                <Input
                  id="get-app-repo"
                  value={getAppRepoUrl}
                  onChange={(event) => setGetAppRepoUrl(event.target.value)}
                  placeholder="https://github.com/frappe/erpnext"
                  autoComplete="off"
                />
                {getAppRepoError ? (
                  <p className="text-xs text-destructive">{getAppRepoError}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="get-app-branch">Branch (optional)</Label>
                <Input
                  id="get-app-branch"
                  value={getAppBranch}
                  onChange={(event) => setGetAppBranch(event.target.value)}
                  placeholder="e.g. version-15"
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => void handleGetAppSubmit()}>
                  Start
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={getAppOperationId}
                lines={getAppStream.lines}
                status={getAppStream.status}
                exitCode={getAppStream.exitCode}
              />
              {getAppStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleGetAppOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
