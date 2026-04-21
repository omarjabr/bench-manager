import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { useCreateTemplate, useUpdateTemplate } from "@/hooks/useTemplates"
import { getApiErrorMessage, type Template } from "@/lib/api"
import {
  customRepoUrlSchema,
  DEFAULT_APP_REGISTRY,
} from "@/schemas/bench.schema"
import {
  templateFormSchema,
  type TemplateFormValues,
} from "@/schemas/template.schema"

type SelectedApp = { name: string; repo_url: string; branch?: string }

function defaultBranchForFrappeVersion(
  v: TemplateFormValues["frappeVersion"]
): string {
  return v
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

type TemplateFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  /** Required when mode is ``edit``. */
  initialTemplate: Template | null
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  mode,
  initialTemplate,
}: TemplateFormDialogProps) {
  const createMutation = useCreateTemplate()
  const updateMutation = useUpdateTemplate()
  const [selectedApps, setSelectedApps] = useState<SelectedApp[]>([])
  const [customRepoInput, setCustomRepoInput] = useState("")
  const [customBranchInput, setCustomBranchInput] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      frappeVersion: "version-15",
      selectedApps: [],
    },
  })

  const { register, control, handleSubmit, reset, getValues, setValue } = form

  useEffect(() => {
    setValue("selectedApps", selectedApps)
  }, [selectedApps, setValue])

  useEffect(() => {
    if (!open) {
      return
    }
    if (mode === "edit" && initialTemplate !== null) {
      reset({
        name: initialTemplate.name,
        frappeVersion: initialTemplate.frappe_version as TemplateFormValues["frappeVersion"],
        selectedApps: initialTemplate.apps.map((a) => ({
          name: a.name,
          repo_url: a.repo_url,
          ...(a.branch !== undefined && a.branch !== ""
            ? { branch: a.branch }
            : {}),
        })),
      })
      setSelectedApps(
        initialTemplate.apps.map((a) => ({
          name: a.name,
          repo_url: a.repo_url,
          ...(a.branch !== undefined && a.branch !== ""
            ? { branch: a.branch }
            : {}),
        }))
      )
    } else if (mode === "create") {
      reset({
        name: "",
        frappeVersion: "version-15",
        selectedApps: [],
      })
      setSelectedApps([])
    }
    setCustomRepoInput("")
    setCustomBranchInput("")
    setFieldErrors({})
  }, [open, mode, initialTemplate, reset])

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

  const onSubmit = (values: TemplateFormValues) => {
    setFieldErrors({})
    const body = {
      name: values.name.trim(),
      frappe_version: values.frappeVersion,
      apps: selectedApps,
    }
    const done = () => {
      onOpenChange(false)
    }
    const fail = (error: unknown) => {
      toast.error(getApiErrorMessage(error))
    }
    if (mode === "create") {
      void createMutation
        .mutateAsync(body)
        .then(done)
        .catch(fail)
    } else if (initialTemplate !== null) {
      void updateMutation
        .mutateAsync({ id: initialTemplate.id, data: body })
        .then(done)
        .catch(fail)
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 px-4 pt-4 pb-2 pr-12">
          <DialogTitle>
            {mode === "create" ? "New Template" : "Edit Template"}
          </DialogTitle>
          <DialogDescription>
            Save a Frappe version and app list to reuse when creating benches.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-0"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit(onSubmit)(event)
          }}
        >
          <ScrollArea className="h-[min(520px,calc(90vh-10rem))] px-4">
            <div className="flex flex-col gap-4 pb-4 pr-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tf-name">Template name</Label>
                <Input
                  id="tf-name"
                  {...register("name")}
                  autoComplete="off"
                />
                {form.formState.errors.name ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Frappe version</span>
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
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground">
                  Select apps to install with{" "}
                  <span className="font-mono">bench get-app</span>.
                </p>
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
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
                  <Label htmlFor="tf-custom-repo">Custom repository (HTTPS)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="tf-custom-repo"
                      value={customRepoInput}
                      onChange={(event) =>
                        setCustomRepoInput(event.target.value)
                      }
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
                      htmlFor="tf-custom-branch"
                      className="text-muted-foreground"
                    >
                      Branch (optional)
                    </Label>
                    <Input
                      id="tf-custom-branch"
                      value={customBranchInput}
                      onChange={(event) =>
                        setCustomBranchInput(event.target.value)
                      }
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
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/30 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner className="size-4" />
              ) : mode === "create" ? (
                "Create"
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
