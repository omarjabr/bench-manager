import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useEffect, useMemo, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

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
import { Spinner } from "@/components/ui/spinner"
import { useCreateTemplate } from "@/hooks/useTemplates"
import {
  getApiErrorMessage,
  getSettings,
  postOperationInit,
  type Template,
} from "@/lib/api"
import {
  customRepoUrlSchema,
  DEFAULT_APP_REGISTRY,
  newBenchWizardAppsStepSchema,
  newBenchWizardFullFormSchema,
  type NewBenchWizardFullFormValues,
} from "@/schemas/bench.schema"
import { useUiStore } from "@/stores/ui.store"

type SelectedApp = { name: string; repo_url: string; branch?: string }

function defaultBranchForFrappeVersion(
  v: NewBenchWizardFullFormValues["frappeVersion"]
): string {
  return v
}

type NewBenchWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional template used to pre-fill Frappe version and apps (also see `wizardTemplate` in the UI store). */
  template?: Template | null
}

function repoNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1] ?? "app"
    return last.replace(/\.git$/i, "")
  } catch {
    return "custom"
  }
}

export function NewBenchWizard({
  open,
  onOpenChange,
  template = null,
}: NewBenchWizardProps) {
  const navigate = useNavigate()
  const setActiveOperationId = useUiStore((s) => s.setActiveOperationId)
  const setActiveBench = useUiStore((s) => s.setActiveBench)
  const wizardTemplate = useUiStore((s) => s.wizardTemplate)
  const setWizardTemplate = useUiStore((s) => s.setWizardTemplate)
  const createTemplateMutation = useCreateTemplate()
  const prefilledRef = useRef(false)

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    enabled: open,
  })

  const [step, setStep] = useState(1)
  const goToStep = (targetStep: number) => {
    setStep(targetStep)
  }
  const [parentDirInitialized, setParentDirInitialized] = useState(false)
  const [selectedApps, setSelectedApps] = useState<SelectedApp[]>([])
  const [customRepoInput, setCustomRepoInput] = useState("")
  const [customBranchInput, setCustomBranchInput] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const form = useForm<NewBenchWizardFullFormValues>({
    resolver: zodResolver(newBenchWizardFullFormSchema),
    defaultValues: {
      benchName: "",
      parentDir: "",
      frappeVersion: "version-15",
      siteName: "",
      adminPassword: "",
      dbRootPassword: "",
    },
  })

  const {
    register,
    control,
    trigger,
    getValues,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = form

  useEffect(() => {
    if (settings !== undefined && !parentDirInitialized && open) {
      setValue("parentDir", settings.root_scan_dir)
      setParentDirInitialized(true)
    }
  }, [settings, parentDirInitialized, open, setValue])

  useEffect(() => {
    if (!open) {
      prefilledRef.current = false
      return
    }
    if (prefilledRef.current) {
      return
    }
    const source = template ?? wizardTemplate
    if (!source) {
      return
    }
    prefilledRef.current = true
    setValue(
      "frappeVersion",
      source.frappe_version as NewBenchWizardFullFormValues["frappeVersion"]
    )
    setSelectedApps(
      source.apps.map((a) => ({
        name: a.name,
        repo_url: a.repo_url,
        ...(a.branch !== undefined && a.branch !== ""
          ? { branch: a.branch }
          : {}),
      }))
    )
    setWizardTemplate(null)
  }, [open, template, wizardTemplate, setValue, setWizardTemplate])

  const resetWizard = () => {
    setStep(1)
    reset({
      benchName: "",
      parentDir: settings?.root_scan_dir ?? "",
      frappeVersion: "version-15",
      siteName: "",
      adminPassword: "",
      dbRootPassword: "",
    })
    setParentDirInitialized(settings !== undefined)
    setSelectedApps([])
    setCustomRepoInput("")
    setCustomBranchInput("")
    setFieldErrors({})
    clearErrors()
    setWizardTemplate(null)
    prefilledRef.current = false
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetWizard()
    }
    onOpenChange(next)
  }

  const toggleRegistryApp = (item: { name: string; repo_url: string }) => {
    setSelectedApps((prev) => {
      const exists = prev.some((a) => a.repo_url === item.repo_url)
      if (exists) {
        return prev.filter((a) => a.repo_url !== item.repo_url)
      }
      return [
        ...prev,
        {
          ...item,
          branch: defaultBranchForFrappeVersion(getValues("frappeVersion")),
        },
      ]
    })
  }

  const updateRegistryAppBranch = (repoUrl: string, branch: string) => {
    setSelectedApps((prev) =>
      prev.map((a) => (a.repo_url === repoUrl ? { ...a, branch } : a))
    )
  }

  const addCustomRepo = () => {
    const parsed = customRepoUrlSchema.safeParse(customRepoInput.trim())
    if (!parsed.success) {
      setFieldErrors({
        customRepo: parsed.error.issues[0]?.message ?? "Invalid URL",
      })
      return
    }
    const url = parsed.data
    setFieldErrors({})
    const name = repoNameFromUrl(url)
    const branchTrim = customBranchInput.trim()
    const entry: SelectedApp = { name, repo_url: url }
    if (branchTrim.length > 0) {
      entry.branch = branchTrim
    }
    setSelectedApps((prev) => {
      if (prev.some((a) => a.repo_url === url)) {
        return prev
      }
      return [...prev, entry]
    })
    setCustomRepoInput("")
    setCustomBranchInput("")
  }

  const goNext = async () => {
    setFieldErrors({})
    if (step === 1) {
      const ok = await trigger(["benchName", "parentDir", "frappeVersion"])
      if (!ok) {
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      const ok = await trigger(["siteName", "adminPassword", "dbRootPassword"])
      if (!ok) {
        return
      }
      setStep(3)
      return
    }
    if (step === 3) {
      const result = newBenchWizardAppsStepSchema.safeParse({ selectedApps })
      if (!result.success) {
        setFieldErrors({
          apps: result.error.issues[0]?.message ?? "Invalid apps",
        })
        return
      }
      setStep(4)
    }
  }

  const goBack = () => {
    setFieldErrors({})
    clearErrors()
    if (step > 1) {
      setStep((s) => s - 1)
    }
  }

  const watched = form.watch()

  const saveAsTemplate = async () => {
    const values = getValues()
    const name = values.benchName.trim()
    if (name.length === 0) {
      toast.error("Enter a bench name to use as the template name.")
      return
    }
    try {
      await createTemplateMutation.mutateAsync({
        name,
        frappe_version: values.frappeVersion,
        apps: selectedApps,
      })
      toast.success("Template saved.")
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  const createBench = async () => {
    setFieldErrors({})
    clearErrors()
    const values = getValues()
    const name = values.benchName.trim()
    try {
      const res = await postOperationInit({
        bench_name: name,
        parent_dir: values.parentDir.trim(),
        frappe_version: values.frappeVersion,
        site_name: values.siteName.trim(),
        admin_password: values.adminPassword,
        db_root_password: values.dbRootPassword,
        apps: selectedApps,
        python_version: "python3.11",
      })
      setActiveOperationId(res.operation_id)
      setActiveBench(name)
      navigate(`/benches/${encodeURIComponent(name)}`)
      handleOpenChange(false)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        goToStep(1)
        setError("benchName", {
          type: "manual",
          message:
            "A bench with this name already exists in the selected directory.",
        })
        return
      }
      toast.error(getApiErrorMessage(error))
    }
  }

  const stepSummary = useMemo(() => {
    return {
      benchName: watched.benchName.trim(),
      parentDir: watched.parentDir.trim(),
      frappeVersion: watched.frappeVersion,
      siteName: watched.siteName.trim(),
      adminPasswordSet: watched.adminPassword.length > 0,
      dbRootPasswordSet: watched.dbRootPassword.length > 0,
      apps: selectedApps,
    }
  }, [
    watched.benchName,
    watched.parentDir,
    watched.frappeVersion,
    watched.siteName,
    watched.adminPassword.length,
    watched.dbRootPassword.length,
    selectedApps,
  ])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New bench</DialogTitle>
          <DialogDescription>
            Step {step} of 4 — create a new Frappe bench with guided options.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full ${
                n <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-bench-name">Bench name</Label>
              <Input
                id="nbw-bench-name"
                {...register("benchName")}
                autoComplete="off"
              />
              {errors.benchName ? (
                <p className="text-xs text-destructive">
                  {errors.benchName.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-parent">Parent directory</Label>
              <Input
                id="nbw-parent"
                {...register("parentDir")}
                autoComplete="off"
              />
              {errors.parentDir ? (
                <p className="text-xs text-destructive">
                  {errors.parentDir.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Frappe branch</span>
              <Controller
                name="frappeVersion"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (
                        value === "version-15" ||
                        value === "version-14" ||
                        value === "develop"
                      ) {
                        field.onChange(value)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="version-15">version-15</SelectItem>
                      <SelectItem value="version-14">version-14</SelectItem>
                      <SelectItem value="develop">develop</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.frappeVersion ? (
                <p className="text-xs text-destructive">
                  {errors.frappeVersion.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-site-name">Site name</Label>
              <Input
                id="nbw-site-name"
                {...register("siteName")}
                placeholder="mysite.localhost"
                autoComplete="off"
              />
              {errors.siteName ? (
                <p className="text-xs text-destructive">
                  {errors.siteName.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-admin-pw">Admin password</Label>
              <Input
                id="nbw-admin-pw"
                type="password"
                {...register("adminPassword")}
                autoComplete="new-password"
              />
              {errors.adminPassword ? (
                <p className="text-xs text-destructive">
                  {errors.adminPassword.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-db-pw">Database root password</Label>
              <Input
                id="nbw-db-pw"
                type="password"
                {...register("dbRootPassword")}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty if your local MariaDB root user has no password.
              </p>
              {errors.dbRootPassword ? (
                <p className="text-xs text-destructive">
                  {errors.dbRootPassword.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Optional — select apps to fetch with{" "}
              <span className="font-mono">bench get-app</span> and install on
              your site. You can skip this step.
            </p>
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
              {DEFAULT_APP_REGISTRY.map((item) => {
                const selected = selectedApps.find(
                  (a) => a.repo_url === item.repo_url
                )
                const checked = selected !== undefined
                return (
                  <div
                    key={item.repo_url}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRegistryApp(item)}
                      />
                      <span className="min-w-0">{item.name}</span>
                    </label>
                    {checked ? (
                      <Input
                        className="max-w-[200px]"
                        value={selected?.branch ?? ""}
                        onChange={(event) =>
                          updateRegistryAppBranch(
                            item.repo_url,
                            event.target.value
                          )
                        }
                        placeholder="Branch"
                        aria-label={`Branch for ${item.name}`}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nbw-custom-repo">Custom repository (HTTPS)</Label>
              <div className="flex gap-2">
                <Input
                  id="nbw-custom-repo"
                  value={customRepoInput}
                  onChange={(event) => setCustomRepoInput(event.target.value)}
                  placeholder="https://github.com/org/repo"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addCustomRepo}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="nbw-custom-branch"
                  className="text-muted-foreground"
                >
                  Branch (optional)
                </Label>
                <Input
                  id="nbw-custom-branch"
                  value={customBranchInput}
                  onChange={(event) => setCustomBranchInput(event.target.value)}
                  placeholder="e.g. version-15"
                  autoComplete="off"
                />
              </div>
              {fieldErrors.customRepo ? (
                <p className="text-xs text-destructive">
                  {fieldErrors.customRepo}
                </p>
              ) : null}
            </div>
            {fieldErrors.apps ? (
              <p className="text-xs text-destructive">{fieldErrors.apps}</p>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Bench name:</span>{" "}
              <span className="font-medium">{stepSummary.benchName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Parent directory:</span>{" "}
              <span className="font-mono text-xs break-all">
                {stepSummary.parentDir}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Frappe branch:</span>{" "}
              {stepSummary.frappeVersion}
            </div>
            <div>
              <span className="text-muted-foreground">Site:</span>{" "}
              <span className="font-mono text-xs">{stepSummary.siteName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Admin password:</span>{" "}
              {stepSummary.adminPasswordSet ? "••••••••" : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">DB root password:</span>{" "}
              {stepSummary.dbRootPasswordSet ? "••••••••" : "(empty)"}
            </div>
            <div>
              <span className="text-muted-foreground">Apps:</span>{" "}
              {stepSummary.apps.length === 0 ? (
                <span>None</span>
              ) : (
                <ul className="mt-1 list-inside list-disc">
                  {stepSummary.apps.map((a) => (
                    <li
                      key={a.repo_url}
                      className="font-mono text-xs break-all"
                    >
                      {a.name} — {a.repo_url}
                      {a.branch !== undefined && a.branch.length > 0
                        ? ` — branch: ${a.branch}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {step < 4 ? (
              <Button type="button" onClick={() => void goNext()}>
                Next
              </Button>
            ) : null}
            {step === 4 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  disabled={createTemplateMutation.isPending}
                  onClick={() => void saveAsTemplate()}
                >
                  {createTemplateMutation.isPending ? (
                    <Spinner className="size-4" />
                  ) : null}
                  Save as Template
                </Button>
                <Button type="button" onClick={() => void createBench()}>
                  Create Bench
                </Button>
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
