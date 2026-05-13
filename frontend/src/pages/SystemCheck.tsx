import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"

import { LogStream } from "@/components/shared/LogStream"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useOperation } from "@/hooks/useOperation"
import { useRunSystemFix, useSystemCheckReport } from "@/hooks/useSystemCheck"
import type { FixGroupId, SystemCheckItem, SystemCheckStatus } from "@/lib/api"
import {
  systemFixSchema,
  type SystemFixValues,
} from "@/schemas/systemCheck.schema"
import { useUiStore } from "@/stores/ui.store"

const MANUAL_COMPLETION_KEY = "bench-manager-system-check-manual"

const STATUS_LABELS: Record<SystemCheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Manual",
  unknown: "Unknown",
}

const STATUS_CLASSES: Record<SystemCheckStatus, string> = {
  pass: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  fail: "border-destructive/30 text-destructive",
  warn: "border-amber-500/30 text-amber-600 dark:text-amber-300",
  unknown: "border-border text-muted-foreground",
}

type ManualCompletionMap = Partial<Record<FixGroupId, boolean>>

function readManualCompletion(): ManualCompletionMap {
  try {
    const raw = localStorage.getItem(MANUAL_COMPLETION_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null) {
      return {}
    }
    return parsed as ManualCompletionMap
  } catch {
    return {}
  }
}

function writeManualCompletion(next: ManualCompletionMap): void {
  try {
    localStorage.setItem(MANUAL_COMPLETION_KEY, JSON.stringify(next))
  } catch {
    /* localStorage may be unavailable */
  }
}

function getManualExtraSteps(itemId: FixGroupId): string[] {
  if (itemId === "mysql_secured") {
    return [
      "Choose whether to switch to unix_socket authentication for root.",
      "Set/change the root password if prompted.",
      "Remove anonymous users.",
      "Disallow remote root login.",
      "Remove test database and reload privilege tables.",
    ]
  }
  if (itemId === "nvm_installed" || itemId === "node_18") {
    return [
      "Open a new shell session after installation.",
      "Run `source ~/.nvm/nvm.sh` in the current shell.",
      "Verify with `node --version`.",
    ]
  }
  return []
}

function statusBadge(status: SystemCheckStatus): JSX.Element {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export default function SystemCheck() {
  const serverId = useUiStore((s) => s.currentServerId)
  const isLocalServer = serverId === "local"
  const queryClient = useQueryClient()
  const [manualCompletion, setManualCompletion] = useState<ManualCompletionMap>(
    () => readManualCompletion(),
  )
  const [activeFixItem, setActiveFixItem] = useState<SystemCheckItem | null>(null)
  const [activeManualItem, setActiveManualItem] = useState<SystemCheckItem | null>(
    null,
  )
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null)
  const operation = useOperation(activeOperationId, serverId)
  const reportQuery = useSystemCheckReport(isLocalServer)
  const runFixMutation = useRunSystemFix()

  const fixForm = useForm<SystemFixValues>({
    resolver: zodResolver(systemFixSchema),
    defaultValues: { sudoPassword: "" },
  })

  useEffect(() => {
    if (
      activeOperationId !== null &&
      operation.status === "done" &&
      operation.exitCode === 0
    ) {
      void queryClient.invalidateQueries({ queryKey: ["system-check", serverId] })
      void reportQuery.refetch()
    }
  }, [
    activeOperationId,
    operation.status,
    operation.exitCode,
    queryClient,
    reportQuery,
    serverId,
  ])

  const items = reportQuery.data?.items ?? []
  const failingItems = useMemo(
    () => items.filter((item) => item.status === "fail"),
    [items],
  )

  const manualItemsDoneCount = useMemo(() => {
    return items
      .filter((item) => item.fix_kind === "manual")
      .filter((item) => manualCompletion[item.id] === true).length
  }, [items, manualCompletion])

  const handleRunFix = async (values: SystemFixValues): Promise<void> => {
    if (activeFixItem === null) {
      return
    }
    const res = await runFixMutation.mutateAsync({
      groupId: activeFixItem.id,
      body: { sudo_password: values.sudoPassword },
    })
    setActiveOperationId(res.operation_id)
    fixForm.reset({ sudoPassword: "" })
  }

  const markManualCompleted = (itemId: FixGroupId, checked: boolean): void => {
    const next = { ...manualCompletion, [itemId]: checked }
    setManualCompletion(next)
    writeManualCompletion(next)
  }

  if (!isLocalServer) {
    return (
      <Alert>
        <AlertTitle>System Check is local-only</AlertTitle>
        <AlertDescription>
          Switch to the Local server to run machine readiness checks and fixes.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">System Check</h2>
        <p className="text-sm text-muted-foreground">
          Validate local prerequisites before running `bench init`.
        </p>
      </div>

      {reportQuery.data?.ready ? (
        <Alert>
          <AlertTitle>Ready to run `bench init`</AlertTitle>
          <AlertDescription>
            All auto-check prerequisites passed on this machine.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Not ready yet</AlertTitle>
          <AlertDescription>
            {failingItems.length > 0
              ? `Failing checks: ${failingItems.map((item) => item.label).join(", ")}`
              : "Resolve manual steps and unknown checks before proceeding."}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Manual steps completed in this browser: {manualItemsDoneCount}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{item.label}</CardTitle>
                {statusBadge(item.status)}
              </div>
              <CardDescription>{item.details}</CardDescription>
            </CardHeader>
            <CardContent>
              {item.fix_kind === "manual" ? (
                <p className="text-xs text-muted-foreground">
                  Manual step required. Track completion locally.
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="justify-end">
              {item.fix_kind === "auto" ? (
                item.status === "pass" ? (
                  <Button type="button" variant="outline" disabled>
                    Already satisfied
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setActiveFixItem(item)}>
                    Fix
                  </Button>
                )
              ) : item.fix_kind === "manual" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveManualItem(item)}
                >
                  Show steps
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled>
                  No fix needed
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {activeOperationId !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>Fix operation log</CardTitle>
            <CardDescription>Operation ID: {activeOperationId}</CardDescription>
          </CardHeader>
          <CardContent>
            <LogStream
              operationId={activeOperationId}
              lines={operation.lines}
              status={operation.status}
              exitCode={operation.exitCode}
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={activeFixItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveFixItem(null)
            fixForm.reset({ sudoPassword: "" })
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run auto-fix</DialogTitle>
            <DialogDescription>
              Enter your sudo password to apply fix for{" "}
              <span className="font-medium text-foreground">
                {activeFixItem?.label}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={fixForm.handleSubmit((values) => {
              void handleRunFix(values)
            })}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Sudo password"
              {...fixForm.register("sudoPassword")}
            />
            {fixForm.formState.errors.sudoPassword ? (
              <p className="text-xs text-destructive">
                {fixForm.formState.errors.sudoPassword.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setActiveFixItem(null)
                  fixForm.reset({ sudoPassword: "" })
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={runFixMutation.isPending}>
                {runFixMutation.isPending ? "Starting..." : "Run fix"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeManualItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveManualItem(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manual steps</DialogTitle>
            <DialogDescription>
              Complete the steps for{" "}
              <span className="font-medium text-foreground">
                {activeManualItem?.label}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {activeManualItem?.manual_commands.map((cmd) => (
              <div
                key={cmd}
                className="rounded-md border border-border bg-muted/30 p-2 font-mono text-xs"
              >
                {cmd}
              </div>
            ))}
            {activeManualItem
              ? getManualExtraSteps(activeManualItem.id).map((step) => (
                  <p key={step} className="text-xs text-muted-foreground">
                    - {step}
                  </p>
                ))
              : null}
            {activeManualItem ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={manualCompletion[activeManualItem.id] === true}
                  onCheckedChange={(checked) =>
                    markManualCompleted(activeManualItem.id, checked === true)
                  }
                />
                <span>I&apos;ve completed this manual step</span>
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setActiveManualItem(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
