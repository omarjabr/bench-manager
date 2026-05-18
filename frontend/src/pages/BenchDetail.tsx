import {
  ArrowUp01Icon,
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
import { FileExplorer } from "@/components/bench/FileExplorer"
import { SiteConfigEditor } from "@/components/bench/SiteConfigEditor"
import { SiteDatabasePanel } from "@/components/bench/SiteDatabasePanel"
import { SiteList } from "@/components/bench/SiteList"
import { SiteLogsPanel } from "@/components/bench/SiteLogsPanel"
import { LogStream } from "@/components/shared/LogStream"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
  postOperationAddSpa,
  postOperationBenchUpdate,
  postOperationGetApp,
  postOperationNewApp,
  restartBench,
  startBench,
  stopBench,
} from "@/lib/api"
import {
  addSpaDialogFormSchema,
  APP_LICENSE_OPTIONS,
  getAppDialogFormSchema,
  newAppDialogFormSchema,
  SPA_FRAMEWORK_OPTIONS,
} from "@/schemas/bench.schema"
import type { AppLicense, SpaFramework } from "@/schemas/bench.schema"
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

  const serverId = useUiStore((s) => s.currentServerId)
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
    void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
    void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
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

  const [newAppOpen, setNewAppOpen] = useState(false)
  const [newAppName, setNewAppName] = useState("")
  const [newAppTitle, setNewAppTitle] = useState("")
  const [newAppDescription, setNewAppDescription] = useState("")
  const [newAppPublisher, setNewAppPublisher] = useState("")
  const [newAppEmail, setNewAppEmail] = useState("")
  const [newAppLicense, setNewAppLicense] = useState<AppLicense>("mit")
  const [newAppGithubWorkflow, setNewAppGithubWorkflow] = useState(false)
  const [newAppError, setNewAppError] = useState<string | null>(null)
  const [newAppOperationId, setNewAppOperationId] = useState<string | null>(null)
  const newAppStream = useOperation(newAppOperationId)
  const newAppToastOpRef = useRef<string | null>(null)

  const [addSpaOpen, setAddSpaOpen] = useState(false)
  const [addSpaName, setAddSpaName] = useState("")
  const [addSpaAppName, setAddSpaAppName] = useState("")
  const [addSpaFramework, setAddSpaFramework] = useState<SpaFramework>("react")
  const [addSpaTailwind, setAddSpaTailwind] = useState(false)
  const [addSpaTypescript, setAddSpaTypescript] = useState(true)
  const [addSpaError, setAddSpaError] = useState<string | null>(null)
  const [addSpaOperationId, setAddSpaOperationId] = useState<string | null>(null)
  const addSpaStream = useOperation(addSpaOperationId)
  const addSpaToastOpRef = useRef<string | null>(null)

  const [installDoppioOperationId, setInstallDoppioOperationId] = useState<string | null>(null)
  const installDoppioStream = useOperation(installDoppioOperationId)
  const installDoppioToastOpRef = useRef<string | null>(null)

  const hasDoppio = useMemo(() => {
    if (!data) return false
    return data.apps.some((app) => app.name === "doppio")
  }, [data])

  const handleStart = async () => {
    if (benchName.length === 0) {
      return
    }
    setControl("start")
    try {
      await startBench(benchName, serverId)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      await queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
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
      await stopBench(benchName, serverId)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      await queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
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
      const res = await postOperationGetApp(payload, serverId)
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
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
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

  const handleNewAppOpenChange = (next: boolean) => {
    if (
      !next &&
      newAppOperationId !== null &&
      newAppStream.status === "running"
    ) {
      return
    }
    if (!next) {
      setNewAppName("")
      setNewAppTitle("")
      setNewAppDescription("")
      setNewAppPublisher("")
      setNewAppEmail("")
      setNewAppLicense("mit")
      setNewAppGithubWorkflow(false)
      setNewAppError(null)
      setNewAppOperationId(null)
      newAppToastOpRef.current = null
    }
    setNewAppOpen(next)
  }

  const handleNewAppSubmit = async () => {
    setNewAppError(null)
    const parsed = newAppDialogFormSchema.safeParse({
      appName: newAppName.trim(),
      appTitle: newAppTitle.trim(),
      appDescription: newAppDescription.trim(),
      appPublisher: newAppPublisher.trim(),
      appEmail: newAppEmail.trim(),
      appLicense: newAppLicense,
      createGithubWorkflow: newAppGithubWorkflow,
    })
    if (!parsed.success) {
      setNewAppError(parsed.error.issues[0]?.message ?? "Invalid input")
      return
    }
    try {
      const res = await postOperationNewApp(
        {
          bench_name: benchName,
          app_name: parsed.data.appName,
          app_title: parsed.data.appTitle,
          app_description: parsed.data.appDescription,
          app_publisher: parsed.data.appPublisher,
          app_email: parsed.data.appEmail,
          app_license: parsed.data.appLicense,
          create_github_workflow: parsed.data.createGithubWorkflow,
        },
        serverId
      )
      setNewAppOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      newAppStream.status === "done" &&
      newAppStream.exitCode === 0 &&
      newAppOperationId !== null
    ) {
      if (newAppToastOpRef.current === newAppOperationId) {
        return
      }
      newAppToastOpRef.current = newAppOperationId
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      toast.success(
        "App created successfully. To install it on a site, use the Install App button on the Sites tab."
      )
    }
  }, [
    newAppStream.status,
    newAppStream.exitCode,
    newAppOperationId,
    queryClient,
    benchName,
    serverId,
  ])

  const handleAddSpaOpenChange = (next: boolean) => {
    const isRunning =
      (addSpaOperationId !== null && addSpaStream.status === "running") ||
      (installDoppioOperationId !== null && installDoppioStream.status === "running")
    if (!next && isRunning) {
      return
    }
    if (!next) {
      setAddSpaName("")
      setAddSpaAppName("")
      setAddSpaFramework("react")
      setAddSpaTailwind(false)
      setAddSpaTypescript(true)
      setAddSpaError(null)
      setAddSpaOperationId(null)
      addSpaToastOpRef.current = null
      setInstallDoppioOperationId(null)
      installDoppioToastOpRef.current = null
    }
    setAddSpaOpen(next)
  }

  const handleInstallDoppio = async () => {
    try {
      const res = await postOperationGetApp(
        {
          bench_name: benchName,
          repo_url: "https://github.com/NagariaHussain/doppio",
        },
        serverId
      )
      setInstallDoppioOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const handleAddSpaSubmit = async () => {
    setAddSpaError(null)
    const parsed = addSpaDialogFormSchema.safeParse({
      spaName: addSpaName.trim(),
      appName: addSpaAppName,
      framework: addSpaFramework,
      useTailwind: addSpaTailwind,
      useTypescript: addSpaTypescript,
    })
    if (!parsed.success) {
      setAddSpaError(parsed.error.issues[0]?.message ?? "Invalid input")
      return
    }
    try {
      const res = await postOperationAddSpa(
        {
          bench_name: benchName,
          spa_name: parsed.data.spaName,
          app_name: parsed.data.appName,
          framework: parsed.data.framework,
          use_tailwind: parsed.data.useTailwind,
          use_typescript: parsed.data.useTypescript,
        },
        serverId
      )
      setAddSpaOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      addSpaStream.status === "done" &&
      addSpaStream.exitCode === 0 &&
      addSpaOperationId !== null
    ) {
      if (addSpaToastOpRef.current === addSpaOperationId) {
        return
      }
      addSpaToastOpRef.current = addSpaOperationId
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      toast.success("SPA created successfully.")
    }
  }, [
    addSpaStream.status,
    addSpaStream.exitCode,
    addSpaOperationId,
    queryClient,
    benchName,
    serverId,
  ])

  useEffect(() => {
    if (
      installDoppioStream.status === "done" &&
      installDoppioStream.exitCode === 0 &&
      installDoppioOperationId !== null
    ) {
      if (installDoppioToastOpRef.current === installDoppioOperationId) {
        return
      }
      installDoppioToastOpRef.current = installDoppioOperationId
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      setInstallDoppioOperationId(null)
      toast.success("Doppio installed successfully. You can now create an SPA.")
    }
  }, [
    installDoppioStream.status,
    installDoppioStream.exitCode,
    installDoppioOperationId,
    queryClient,
    benchName,
    serverId,
  ])

  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateReset, setUpdateReset] = useState(false)
  const [updateNoBackup, setUpdateNoBackup] = useState(false)
  const [updateOperationId, setUpdateOperationId] = useState<string | null>(null)
  const updateStream = useOperation(updateOperationId)
  const updateToastRef = useRef<string | null>(null)

  const handleUpdateOpenChange = (next: boolean) => {
    if (!next && updateOperationId !== null && updateStream.status === "running") {
      return
    }
    if (!next) {
      setUpdateReset(false)
      setUpdateNoBackup(false)
      setUpdateOperationId(null)
      updateToastRef.current = null
    }
    setUpdateOpen(next)
  }

  const handleUpdateSubmit = async () => {
    try {
      const res = await postOperationBenchUpdate({
        bench_name: benchName,
        reset: updateReset,
        no_backup: updateNoBackup,
      }, serverId)
      setUpdateOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      updateStream.status === "done" &&
      updateStream.exitCode === 0 &&
      updateOperationId !== null
    ) {
      if (updateToastRef.current === updateOperationId) return
      updateToastRef.current = updateOperationId
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
      toast.success("Bench updated successfully")
    }
  }, [updateStream.status, updateStream.exitCode, updateOperationId, queryClient, benchName])

  const handleRestart = async () => {
    if (benchName.length === 0) {
      return
    }
    setControl("restart")
    try {
      await restartBench(benchName, serverId)
      await queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
      await queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
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

  return (
    <div className="flex flex-col gap-6">
      {isLoading && !showInitLog ? (
        <Skeleton className="h-7 w-48" />
      ) : null}

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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setUpdateOpen(true)}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
              Update
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
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setGetAppOpen(true)}
                >
                  Get App
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewAppOpen(true)}
                >
                  New App
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddSpaOpen(true)}
                >
                  Create SPA
                </Button>
              </div>
              <AppList apps={data.apps} />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          {showInitLog && activeOperationId !== null ? (
            <div className="w-full rounded-lg border border-border bg-card p-4 shadow-md">
              <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Bench setup in progress
              </p>
              <LogStream
                operationId={activeOperationId}
                lines={initOperation.lines}
                status={initOperation.status}
                exitCode={initOperation.exitCode}
              />
            </div>
          ) : data ? (
            <SiteLogsPanel benchName={data.name} sites={data.sites} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No active operation. Logs will appear here during bench init or
              similar operations.
            </p>
          )}
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
            <FileExplorer benchName={data.name} />
          ) : null}
        </TabsContent>
        <TabsContent
          value="database"
          className="mt-4 flex min-h-[500px] flex-col"
        >
          {showInitLog && !data ? (
            <p className="text-sm text-muted-foreground">
              Database will appear here after the bench is ready.
            </p>
          ) : null}
          {isLoading && !showInitLog ? (
            <TabPanelSkeleton />
          ) : data ? (
            <SiteDatabasePanel
              benchName={data.name}
              sites={data.sites}
            />
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
            <SiteConfigEditor benchName={data.name} sites={data.sites} />
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

      {/* New App dialog */}
      <Dialog open={newAppOpen} onOpenChange={handleNewAppOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={
            !(newAppOperationId !== null && newAppStream.status === "running")
          }
          onPointerDownOutside={(event) => {
            if (
              newAppOperationId !== null &&
              newAppStream.status === "running"
            ) {
              event.preventDefault()
            }
          }}
          onEscapeKeyDown={(event) => {
            if (
              newAppOperationId !== null &&
              newAppStream.status === "running"
            ) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create new app</DialogTitle>
            <DialogDescription>
              Scaffold a new Frappe app in this bench using{" "}
              <span className="font-mono text-xs">bench new-app</span>.
            </DialogDescription>
          </DialogHeader>
          {newAppOperationId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-name">App Name</Label>
                <Input
                  id="new-app-name"
                  value={newAppName}
                  onChange={(event) => setNewAppName(event.target.value)}
                  placeholder="my_custom_app"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, digits, and underscores only.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-title">App Title</Label>
                <Input
                  id="new-app-title"
                  value={newAppTitle}
                  onChange={(event) => setNewAppTitle(event.target.value)}
                  placeholder="My Custom App"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-description">App Description</Label>
                <Input
                  id="new-app-description"
                  value={newAppDescription}
                  onChange={(event) => setNewAppDescription(event.target.value)}
                  placeholder="A brief description of the app"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-publisher">App Publisher</Label>
                <Input
                  id="new-app-publisher"
                  value={newAppPublisher}
                  onChange={(event) => setNewAppPublisher(event.target.value)}
                  placeholder="Your Name or Company"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-email">App Email</Label>
                <Input
                  id="new-app-email"
                  type="email"
                  value={newAppEmail}
                  onChange={(event) => setNewAppEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-app-license">App License</Label>
                <Select
                  value={newAppLicense}
                  onValueChange={(value) => setNewAppLicense(value as AppLicense)}
                >
                  <SelectTrigger id="new-app-license" className="w-full">
                    <SelectValue placeholder="Select a license" />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_LICENSE_OPTIONS.map((license) => (
                      <SelectItem key={license} value={license}>
                        {license}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="new-app-github-workflow"
                  checked={newAppGithubWorkflow}
                  onCheckedChange={setNewAppGithubWorkflow}
                />
                <Label htmlFor="new-app-github-workflow" className="cursor-pointer">
                  Create GitHub Workflow action for unittests
                </Label>
              </div>
              {newAppError ? (
                <p className="text-xs text-destructive">{newAppError}</p>
              ) : null}
              <DialogFooter>
                <Button type="button" onClick={() => void handleNewAppSubmit()}>
                  Create App
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={newAppOperationId}
                lines={newAppStream.lines}
                status={newAppStream.status}
                exitCode={newAppStream.exitCode}
              />
              {newAppStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleNewAppOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add SPA dialog */}
      <Dialog open={addSpaOpen} onOpenChange={handleAddSpaOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={
            !(
              (addSpaOperationId !== null && addSpaStream.status === "running") ||
              (installDoppioOperationId !== null && installDoppioStream.status === "running")
            )
          }
          onPointerDownOutside={(event) => {
            if (
              (addSpaOperationId !== null && addSpaStream.status === "running") ||
              (installDoppioOperationId !== null && installDoppioStream.status === "running")
            ) {
              event.preventDefault()
            }
          }}
          onEscapeKeyDown={(event) => {
            if (
              (addSpaOperationId !== null && addSpaStream.status === "running") ||
              (installDoppioOperationId !== null && installDoppioStream.status === "running")
            ) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create SPA</DialogTitle>
            <DialogDescription>
              {hasDoppio
                ? "Scaffold a new Single Page Application using "
                : "Doppio is required to create SPAs. "}
              {hasDoppio ? (
                <span className="font-mono text-xs">bench add-spa</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {!hasDoppio && installDoppioOperationId === null ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                The <span className="font-medium">doppio</span> app is not installed in this bench.
                Doppio enables you to create modern Single Page Applications (Vue or React)
                within your Frappe apps.
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddSpaOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleInstallDoppio()}>
                  Install Doppio
                </Button>
              </DialogFooter>
            </div>
          ) : installDoppioOperationId !== null ? (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={installDoppioOperationId}
                lines={installDoppioStream.lines}
                status={installDoppioStream.status}
                exitCode={installDoppioStream.exitCode}
              />
              {installDoppioStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAddSpaOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          ) : addSpaOperationId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="add-spa-name">Dashboard Name</Label>
                <Input
                  id="add-spa-name"
                  value={addSpaName}
                  onChange={(event) => setAddSpaName(event.target.value)}
                  placeholder="my_dashboard"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, digits, and underscores only.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="add-spa-app">App Name</Label>
                <Select
                  value={addSpaAppName}
                  onValueChange={setAddSpaAppName}
                >
                  <SelectTrigger id="add-spa-app" className="w-full">
                    <SelectValue placeholder="Select an app" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.apps
                      .filter((app) => app.name !== "frappe" && app.name !== "doppio")
                      .map((app) => (
                        <SelectItem key={app.name} value={app.name}>
                          {app.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The Frappe app where the SPA will be created.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="add-spa-framework">Framework</Label>
                <Select
                  value={addSpaFramework}
                  onValueChange={(value) => setAddSpaFramework(value as SpaFramework)}
                >
                  <SelectTrigger id="add-spa-framework" className="w-full">
                    <SelectValue placeholder="Select a framework" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPA_FRAMEWORK_OPTIONS.map((framework) => (
                      <SelectItem key={framework} value={framework}>
                        {framework.charAt(0).toUpperCase() + framework.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <Switch
                    id="add-spa-tailwind"
                    checked={addSpaTailwind}
                    onCheckedChange={setAddSpaTailwind}
                  />
                  <Label htmlFor="add-spa-tailwind" className="cursor-pointer">
                    Include TailwindCSS
                  </Label>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-500 ml-12">
                  May fail with newer Vite versions due to a doppio bug.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="add-spa-typescript"
                  checked={addSpaTypescript}
                  onCheckedChange={setAddSpaTypescript}
                />
                <Label htmlFor="add-spa-typescript" className="cursor-pointer">
                  Include TypeScript
                </Label>
              </div>
              {addSpaError ? (
                <p className="text-xs text-destructive">{addSpaError}</p>
              ) : null}
              <DialogFooter>
                <Button type="button" onClick={() => void handleAddSpaSubmit()}>
                  Create SPA
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={addSpaOperationId}
                lines={addSpaStream.lines}
                status={addSpaStream.status}
                exitCode={addSpaStream.exitCode}
              />
              {addSpaStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAddSpaOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bench Update dialog */}
      <Dialog open={updateOpen} onOpenChange={handleUpdateOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={
            !(updateOperationId !== null && updateStream.status === "running")
          }
          onPointerDownOutside={(event) => {
            if (updateOperationId !== null && updateStream.status === "running") {
              event.preventDefault()
            }
          }}
          onEscapeKeyDown={(event) => {
            if (updateOperationId !== null && updateStream.status === "running") {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Update bench</DialogTitle>
            <DialogDescription>
              Run{" "}
              <span className="font-mono text-xs">bench update</span> to pull
              the latest changes for all apps and run migrations.
            </DialogDescription>
          </DialogHeader>
          {updateOperationId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="update-reset"
                  checked={updateReset}
                  onCheckedChange={(c) => setUpdateReset(c === true)}
                />
                <Label htmlFor="update-reset" className="cursor-pointer">
                  Hard reset git repos before update (--reset)
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="update-no-backup"
                  checked={updateNoBackup}
                  onCheckedChange={(c) => setUpdateNoBackup(c === true)}
                />
                <Label htmlFor="update-no-backup" className="cursor-pointer">
                  Skip pre-update backup (--no-backup)
                </Label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => void handleUpdateSubmit()}
                >
                  Start Update
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={updateOperationId}
                lines={updateStream.lines}
                status={updateStream.status}
                exitCode={updateStream.exitCode}
              />
              {updateStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUpdateOpenChange(false)}
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
