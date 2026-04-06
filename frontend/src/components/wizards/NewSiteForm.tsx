import { useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { LogStream } from "@/components/shared/LogStream"
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
import { useOperation } from "@/hooks/useOperation"
import {
  getApiErrorMessage,
  postOperationNewSite,
  type AppInfo,
} from "@/lib/api"
import {
  newSiteOperationSchema,
  type NewSiteOperationFormValues,
} from "@/schemas/site.schema"

type NewSiteFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  benchName: string
  availableApps: AppInfo[]
}

export function NewSiteForm({
  open,
  onOpenChange,
  benchName,
  availableApps,
}: NewSiteFormProps) {
  const queryClient = useQueryClient()
  const [operationId, setOperationId] = useState<string | null>(null)
  const { lines, status, exitCode } = useOperation(operationId)

  const form = useForm<NewSiteOperationFormValues>({
    resolver: zodResolver(newSiteOperationSchema),
    defaultValues: {
      siteName: "",
      adminPassword: "",
      dbRootPassword: "",
      apps: [],
    },
  })

  useEffect(() => {
    if (!open) {
      setOperationId(null)
      form.reset({
        siteName: "",
        adminPassword: "",
        dbRootPassword: "",
        apps: [],
      })
    }
  }, [open, form])

  const isRunning = operationId !== null && status === "running"
  const showLog = operationId !== null

  const handleOpenChange = (next: boolean) => {
    if (!next && isRunning) {
      return
    }
    onOpenChange(next)
  }

  const onSubmit = async (values: NewSiteOperationFormValues) => {
    try {
      const res = await postOperationNewSite({
        bench_name: benchName,
        site_name: values.siteName,
        admin_password: values.adminPassword,
        db_root_password: values.dbRootPassword,
        apps: values.apps,
      })
      setOperationId(res.operation_id)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  useEffect(() => {
    if (status === "done" && exitCode === 0) {
      void queryClient.invalidateQueries({ queryKey: ["bench", benchName] })
      void queryClient.invalidateQueries({ queryKey: ["benches"] })
    }
  }, [status, exitCode, queryClient, benchName])

  const success = status === "done" && exitCode === 0
  const selectedApps = form.watch("apps")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!isRunning}
        onPointerDownOutside={(event) => {
          if (isRunning) {
            event.preventDefault()
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isRunning) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New site</DialogTitle>
          <DialogDescription>
            Create a new site in bench{" "}
            <span className="font-medium text-foreground">{benchName}</span>.
          </DialogDescription>
        </DialogHeader>

        {showLog ? (
          <div className="flex flex-col gap-3">
            <LogStream
              operationId={operationId}
              lines={lines}
              status={status}
              exitCode={exitCode}
            />
            {success ? (
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            ) : null}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values: NewSiteOperationFormValues) => {
              void onSubmit(values)
            })}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-site-name">Site name</Label>
              <Input
                id="new-site-name"
                autoComplete="off"
                placeholder="site.localhost"
                {...form.register("siteName")}
              />
              {form.formState.errors.siteName ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.siteName.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-site-admin-pw">Admin password</Label>
              <Input
                id="new-site-admin-pw"
                type="password"
                autoComplete="new-password"
                {...form.register("adminPassword")}
              />
              {form.formState.errors.adminPassword ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.adminPassword.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-site-db-pw">Database root password</Label>
              <Input
                id="new-site-db-pw"
                type="password"
                autoComplete="new-password"
                {...form.register("dbRootPassword")}
              />
              {form.formState.errors.dbRootPassword ? (
                <p className="text-destructive text-xs">
                  {form.formState.errors.dbRootPassword.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Apps to install</span>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                {availableApps.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No apps detected in this bench yet.
                  </p>
                ) : (
                  availableApps.map((app) => (
                    <label
                      key={app.name}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedApps.includes(app.name)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...selectedApps, app.name]
                            : selectedApps.filter((name) => name !== app.name)
                          form.setValue("apps", next, {
                            shouldValidate: true,
                          })
                        }}
                      />
                      <span>{app.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Create site</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
