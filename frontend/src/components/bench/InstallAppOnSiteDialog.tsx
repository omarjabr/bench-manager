import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
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
import { Label } from "@/components/ui/label"
import { useOperation } from "@/hooks/useOperation"
import { getApiErrorMessage, postOperationInstallAppOnSite } from "@/lib/api"
import {
  installAppsOnSiteSchema,
  type InstallAppsOnSiteFormValues,
} from "@/schemas/site.schema"
import { useUiStore } from "@/stores/ui.store"

type InstallAppOnSiteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteName: string
  benchName: string
  availableAppNames: string[]
}

/**
 * Runs ``bench install-app`` for selected apps, migrate, and bench restart; streams logs.
 */
export function InstallAppOnSiteDialog({
  open,
  onOpenChange,
  siteName,
  benchName,
  availableAppNames,
}: InstallAppOnSiteDialogProps) {
  const [installOperationId, setInstallOperationId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const serverId = useUiStore((s) => s.currentServerId)
  const installStream = useOperation(installOperationId)
  const processedInstallOpRef = useRef<string | null>(null)

  const form = useForm<InstallAppsOnSiteFormValues>({
    resolver: zodResolver(installAppsOnSiteSchema),
    defaultValues: { apps: [] },
  })

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = form

  const selectedApps = watch("apps")

  useEffect(() => {
    if (open && installOperationId === null) {
      reset({ apps: [] })
    }
  }, [open, installOperationId, reset])

  useEffect(() => {
    if (
      installOperationId === null ||
      installStream.status !== "done" ||
      installStream.exitCode === null
    ) {
      return
    }
    if (processedInstallOpRef.current === installOperationId) {
      return
    }
    processedInstallOpRef.current = installOperationId
    void queryClient.invalidateQueries({ queryKey: ["bench", benchName, serverId] })
    void queryClient.invalidateQueries({ queryKey: ["benches", serverId] })
    if (installStream.exitCode === 0) {
      toast.success("Apps installed. Bench was restarted.")
    } else {
      toast.error(
        `Operation finished with exit code ${String(installStream.exitCode)}. Check the log for details.`
      )
    }
  }, [
    installOperationId,
    installStream.status,
    installStream.exitCode,
    benchName,
    queryClient,
  ])

  const toggleApp = (name: string) => {
    const cur = selectedApps
    if (cur.includes(name)) {
      setValue(
        "apps",
        cur.filter((x) => x !== name),
        { shouldValidate: true }
      )
    } else {
      setValue("apps", [...cur, name], { shouldValidate: true })
    }
  }

  const onInstallSubmit = handleSubmit(async (values) => {
    try {
      const res = await postOperationInstallAppOnSite({
        bench_name: benchName,
        site_name: siteName,
        apps: values.apps,
      }, serverId)
      setInstallOperationId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (installOperationId !== null && installStream.status === "running") {
          return
        }
        if (!next) {
          setInstallOperationId(null)
          processedInstallOpRef.current = null
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={
          !(installOperationId !== null && installStream.status === "running")
        }
        onPointerDownOutside={(event) => {
          if (installOperationId !== null && installStream.status === "running") {
            event.preventDefault()
          }
        }}
        onEscapeKeyDown={(event) => {
          if (installOperationId !== null && installStream.status === "running") {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Install apps on {siteName}</DialogTitle>
          <DialogDescription>
            Select apps from this bench that are not yet installed on this site.
          </DialogDescription>
        </DialogHeader>
        {installOperationId === null ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              void onInstallSubmit(event)
            }}
          >
            <div className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
              {availableAppNames.map((name) => (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selectedApps.includes(name)}
                    onCheckedChange={() => toggleApp(name)}
                  />
                  <span className="font-mono">{name}</span>
                </label>
              ))}
            </div>
            {errors.apps ? (
              <p className="text-destructive text-xs">{errors.apps.message}</p>
            ) : null}
            <DialogFooter>
              <Button type="submit">Install</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <Label className="text-muted-foreground text-xs">Log output</Label>
            <LogStream
              operationId={installOperationId}
              lines={installStream.lines}
              status={installStream.status}
              exitCode={installStream.exitCode}
            />
            {installStream.status !== "running" ? (
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setInstallOperationId(null)
                    onOpenChange(false)
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
