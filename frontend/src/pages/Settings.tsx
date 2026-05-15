import { zodResolver } from "@hookform/resolvers/zod"
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  InformationCircleIcon,
  LinkSquare01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useLocation } from "react-router-dom"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useSettings } from "@/hooks/useSettings"
import {
  getApiErrorMessage,
  updateSettings,
  type AppRegistryEntry,
} from "@/lib/api"
import {
  appRegistryItemSchema,
  databaseConnectionSchema,
  discoverySettingsSchema,
  type AppRegistryItemFormValues,
  type DatabaseConnectionFormValues,
  type DiscoverySettingsFormValues,
} from "@/schemas/settings.schema"
import { useUiStore } from "@/stores/ui.store"

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

function DiscoveryCard() {
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)
  const { data: settings } = useSettings()
  const [excludedPaths, setExcludedPaths] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  const form = useForm<DiscoverySettingsFormValues>({
    resolver: zodResolver(discoverySettingsSchema),
    mode: "onBlur",
    defaultValues: {
      root_scan_dir: "",
      excluded_paths: [],
      scan_interval_seconds: 60,
    },
  })

  useEffect(() => {
    if (settings) {
      form.reset({
        root_scan_dir: settings.root_scan_dir,
        excluded_paths: settings.excluded_paths,
        scan_interval_seconds: settings.scan_interval_seconds,
      })
      setExcludedPaths(settings.excluded_paths)
    }
  }, [settings, form])

  useEffect(() => {
    form.setValue("excluded_paths", excludedPaths)
  }, [excludedPaths, form])

  const mutation = useMutation({
    mutationFn: (values: DiscoverySettingsFormValues) =>
      updateSettings(
        {
          root_scan_dir: values.root_scan_dir,
          excluded_paths: values.excluded_paths,
          scan_interval_seconds: values.scan_interval_seconds,
        },
        serverId
      ),
    onSuccess: () => {
      toast.success("Discovery settings saved")
      void queryClient.invalidateQueries({ queryKey: ["settings", serverId] })
      void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed.length === 0) return
    if (excludedPaths.includes(trimmed)) {
      setTagInput("")
      return
    }
    setExcludedPaths((prev) => [...prev, trimmed])
    setTagInput("")
  }

  const removeTag = (pattern: string) => {
    setExcludedPaths((prev) => prev.filter((p) => p !== pattern))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bench Discovery</CardTitle>
        <CardDescription>
          Configure where Bench Manager scans for Frappe bench installations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="root_scan_dir">Root scan directory</Label>
            <Input
              id="root_scan_dir"
              autoComplete="off"
              {...form.register("root_scan_dir")}
            />
            {form.formState.errors.root_scan_dir && (
              <p className="text-xs text-destructive">
                {form.formState.errors.root_scan_dir.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Excluded paths</Label>
            <div className="flex flex-wrap gap-1.5">
              {excludedPaths.map((pattern) => (
                <Badge
                  key={pattern}
                  variant="secondary"
                  className="gap-1 pr-1 font-mono text-xs"
                >
                  {pattern}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                    onClick={() => removeTag(pattern)}
                    aria-label={`Remove ${pattern}`}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. */node_modules/*"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addTag}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan_interval">Scan interval (seconds)</Label>
            <Input
              id="scan_interval"
              type="number"
              min={10}
              max={3600}
              autoComplete="off"
              {...form.register("scan_interval_seconds")}
            />
            {form.formState.errors.scan_interval_seconds && (
              <p className="text-xs text-destructive">
                {form.formState.errors.scan_interval_seconds.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-fit gap-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Spinner className="size-4" />}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppRegistryCard() {
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)
  const { data: settings } = useSettings()
  const [showAddForm, setShowAddForm] = useState(false)

  const addForm = useForm<AppRegistryItemFormValues>({
    resolver: zodResolver(appRegistryItemSchema),
    mode: "onBlur",
    defaultValues: { name: "", repo_url: "", default_branch: "" },
  })

  const saveMutation = useMutation({
    mutationFn: (registry: AppRegistryEntry[]) =>
      updateSettings({ app_registry: registry }, serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", serverId] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  const handleAdd = useCallback(
    (values: AppRegistryItemFormValues) => {
      if (!settings) return
      const updated = [
        ...settings.app_registry,
        {
          name: values.name.trim(),
          repo_url: values.repo_url.trim(),
          default_branch: values.default_branch.trim(),
        },
      ]
      saveMutation.mutate(updated)
      addForm.reset()
      setShowAddForm(false)
      toast.success(`Added ${values.name}`)
    },
    [settings, saveMutation, addForm]
  )

  const handleDelete = useCallback(
    (repoUrl: string) => {
      if (!settings) return
      const updated = settings.app_registry.filter(
        (app) => app.repo_url !== repoUrl
      )
      saveMutation.mutate(updated)
      toast.success("App removed from registry")
    },
    [settings, saveMutation]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>App Registry</CardTitle>
        <CardDescription>
          Common Frappe apps shown in the New Bench Wizard and Template forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Repo URL</TableHead>
              <TableHead>Default Branch</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(settings?.app_registry ?? []).map((app) => (
              <TableRow key={app.repo_url}>
                <TableCell className="font-medium">{app.name}</TableCell>
                <TableCell className="max-w-[280px] truncate font-mono text-xs">
                  <a
                    href={app.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {app.repo_url}
                  </a>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {app.default_branch}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    disabled={saveMutation.isPending}
                    onClick={() => handleDelete(app.repo_url)}
                    aria-label={`Delete ${app.name}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(settings?.app_registry ?? []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-6 text-center text-muted-foreground"
                >
                  No apps in the registry.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {showAddForm ? (
          <form
            className="flex max-w-lg flex-col gap-3 rounded-lg border border-border p-4"
            onSubmit={addForm.handleSubmit(handleAdd)}
          >
            <div className="space-y-1">
              <Label htmlFor="add-app-name">Name</Label>
              <Input
                id="add-app-name"
                autoComplete="off"
                {...addForm.register("name")}
              />
              {addForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {addForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-app-url">Repo URL</Label>
              <Input
                id="add-app-url"
                autoComplete="off"
                placeholder="https://github.com/org/repo"
                {...addForm.register("repo_url")}
              />
              {addForm.formState.errors.repo_url && (
                <p className="text-xs text-destructive">
                  {addForm.formState.errors.repo_url.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-app-branch">Default branch</Label>
              <Input
                id="add-app-branch"
                autoComplete="off"
                placeholder="e.g. main, develop, version-15"
                {...addForm.register("default_branch")}
              />
              {addForm.formState.errors.default_branch && (
                <p className="text-xs text-destructive">
                  {addForm.formState.errors.default_branch.message}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                className="gap-1.5"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && <Spinner className="size-4" />}
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  addForm.reset()
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => setShowAddForm(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add App
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function DatabaseConnectionCard() {
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)
  const location = useLocation()
  const { data: settings, isLoading } = useSettings()

  const form = useForm<DatabaseConnectionFormValues>({
    resolver: zodResolver(databaseConnectionSchema),
    mode: "onBlur",
    defaultValues: {
      db_host: "127.0.0.1",
      db_user: "root",
      db_password: "",
    },
  })

  useEffect(() => {
    if (settings) {
      form.reset({
        db_host: settings.db_host,
        db_user: settings.db_user,
        db_password: settings.db_password,
      })
    }
  }, [settings, form])

  useEffect(() => {
    if (location.hash === "#database-connection") {
      document
        .getElementById("database-connection")
        ?.scrollIntoView({ behavior: "smooth" })
    }
  }, [location.hash])

  const mutation = useMutation({
    mutationFn: (values: DatabaseConnectionFormValues) =>
      updateSettings(values, serverId),
    onSuccess: () => {
      toast.success("Database settings saved")
      void queryClient.invalidateQueries({ queryKey: ["settings", serverId] })
      void queryClient.invalidateQueries({
        queryKey: ["database", "status", serverId],
      })
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <Card id="database-connection">
      <CardHeader>
        <CardTitle>Database Connection</CardTitle>
        <CardDescription>
          Auto-detected from ~/.my.cnf when present. These values are used as
          fallback only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="db_host">DB Host</Label>
            <Input
              id="db_host"
              autoComplete="off"
              {...form.register("db_host")}
            />
            {form.formState.errors.db_host && (
              <p className="text-xs text-destructive">
                {form.formState.errors.db_host.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="db_user">DB User</Label>
            <Input
              id="db_user"
              autoComplete="username"
              {...form.register("db_user")}
            />
            {form.formState.errors.db_user && (
              <p className="text-xs text-destructive">
                {form.formState.errors.db_user.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="db_password">DB Password</Label>
            <Input
              id="db_password"
              type="password"
              autoComplete="current-password"
              {...form.register("db_password")}
            />
            {form.formState.errors.db_password && (
              <p className="text-xs text-destructive">
                {form.formState.errors.db_password.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-fit gap-2"
            disabled={mutation.isPending || isLoading}
          >
            {mutation.isPending && <Spinner className="size-4" />}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AboutCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("http://localhost:8000/health")
      if (!res.ok) throw new Error("Backend unreachable")
      return (await res.json()) as { status: string }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  })

  const isHealthy = data?.status === "ok"

  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">App</dt>
          <dd className="font-medium">Bench Manager</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono text-xs">1.0.0</dd>
          <dt className="text-muted-foreground">Repository</dt>
          <dd>
            <a
              href="https://github.com/omarjabr/bench-manager"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <HugeiconsIcon icon={LinkSquare01Icon} className="size-3.5" />
              GitHub
            </a>
          </dd>
          <dt className="text-muted-foreground">Backend</dt>
          <dd>
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : isError || !isHealthy ? (
              <span className="inline-flex items-center gap-1.5 text-destructive">
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  className="size-4"
                />
                Backend unreachable
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-4"
                />
                Backend running
              </span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const { isLoading } = useSettings()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <SettingsSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <DiscoveryCard />
      <AppRegistryCard />
      <DatabaseConnectionCard />
      <AboutCard />
    </div>
  )
}
