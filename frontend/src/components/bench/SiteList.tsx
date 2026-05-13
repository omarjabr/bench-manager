import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  DatabaseRestoreIcon,
  Download04Icon,
  InternetIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState, useMemo, useEffect } from "react"
import { toast } from "sonner"

import { InstallAppOnSiteDialog } from "@/components/bench/InstallAppOnSiteDialog"
import { LogStream } from "@/components/shared/LogStream"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  postOperationSiteBackup,
  postOperationSiteRestore,
  type AppInfo,
  type SiteInfo,
} from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

type SiteListProps = {
  sites: SiteInfo[]
  benchApps: AppInfo[]
  benchName: string
}

export function SiteList({ sites, benchApps, benchName }: SiteListProps) {
  if (sites.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No sites found</p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {sites.map((site) => (
        <SiteRow
          key={site.name}
          site={site}
          benchApps={benchApps}
          benchName={benchName}
        />
      ))}
    </ul>
  )
}

function availableAppNames(site: SiteInfo, benchApps: AppInfo[]): string[] {
  const installed = new Set(site.installed_apps.map((a) => a.name))
  return benchApps
    .map((a) => a.name)
    .filter((name) => !installed.has(name))
}

function SiteRow({
  site,
  benchApps,
  benchName,
}: {
  site: SiteInfo
  benchApps: AppInfo[]
  benchName: string
}) {
  const serverId = useUiStore((s) => s.currentServerId)
  const [open, setOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  /* Backup state */
  const [backupOpen, setBackupOpen] = useState(false)
  const [backupWithFiles, setBackupWithFiles] = useState(false)
  const [backupOpId, setBackupOpId] = useState<string | null>(null)
  const backupStream = useOperation(backupOpId)
  const backupToastRef = useRef<string | null>(null)

  const handleBackupOpenChange = (next: boolean) => {
    if (!next && backupOpId !== null && backupStream.status === "running") return
    if (!next) {
      setBackupWithFiles(false)
      setBackupOpId(null)
      backupToastRef.current = null
    }
    setBackupOpen(next)
  }

  const handleBackupSubmit = async () => {
    try {
      const res = await postOperationSiteBackup({
        bench_name: benchName,
        site_name: site.name,
        with_files: backupWithFiles,
      }, serverId)
      setBackupOpId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      backupStream.status === "done" &&
      backupStream.exitCode === 0 &&
      backupOpId !== null
    ) {
      if (backupToastRef.current === backupOpId) return
      backupToastRef.current = backupOpId
      toast.success("Backup completed successfully")
    }
  }, [backupStream.status, backupStream.exitCode, backupOpId])

  /* Restore state */
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restorePath, setRestorePath] = useState("")
  const [restoreDbPassword, setRestoreDbPassword] = useState("")
  const [restoreOpId, setRestoreOpId] = useState<string | null>(null)
  const restoreStream = useOperation(restoreOpId)
  const restoreToastRef = useRef<string | null>(null)

  const handleRestoreOpenChange = (next: boolean) => {
    if (!next && restoreOpId !== null && restoreStream.status === "running") return
    if (!next) {
      setRestorePath("")
      setRestoreDbPassword("")
      setRestoreOpId(null)
      restoreToastRef.current = null
    }
    setRestoreOpen(next)
  }

  const handleRestoreSubmit = async () => {
    if (restorePath.trim().length === 0 || restoreDbPassword.length === 0) {
      toast.error("Backup path and DB root password are required")
      return
    }
    try {
      const res = await postOperationSiteRestore({
        bench_name: benchName,
        site_name: site.name,
        backup_path: restorePath.trim(),
        db_root_password: restoreDbPassword,
      }, serverId)
      setRestoreOpId(res.operation_id)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (
      restoreStream.status === "done" &&
      restoreStream.exitCode === 0 &&
      restoreOpId !== null
    ) {
      if (restoreToastRef.current === restoreOpId) return
      restoreToastRef.current = restoreOpId
      toast.success("Restore completed successfully")
    }
  }, [restoreStream.status, restoreStream.exitCode, restoreOpId])

  const toInstall = useMemo(
    () => availableAppNames(site, benchApps),
    [site, benchApps],
  )

  return (
    <li className="rounded-lg border border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 px-2 py-1">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-expanded={open}
              aria-label={
                open ? `Collapse apps for ${site.name}` : `Expand apps for ${site.name}`
              }
            >
              <HugeiconsIcon
                icon={open ? ArrowUp01Icon : ArrowDown01Icon}
                className="size-4"
              />
            </Button>
          </CollapsibleTrigger>
          <span className="min-w-0 flex-1 font-medium">{site.name}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1"
            asChild
          >
            <a
              href={`http://${site.name}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HugeiconsIcon icon={InternetIcon} className="size-4" />
              Open in Browser
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1"
            onClick={() => setBackupOpen(true)}
          >
            <HugeiconsIcon icon={Download04Icon} className="size-4" />
            Backup
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1"
            onClick={() => setRestoreOpen(true)}
          >
            <HugeiconsIcon icon={DatabaseRestoreIcon} className="size-4" />
            Restore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1"
            disabled={toInstall.length === 0}
            onClick={() => setInstallOpen(true)}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Install App
          </Button>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-3 py-2 pl-11">
            {site.installed_apps.length === 0 ? (
              <p className="text-muted-foreground text-xs">No apps on this site</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {site.installed_apps.map((app) => (
                  <li
                    key={`${site.name}-${app.name}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>{app.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {app.version}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <InstallAppOnSiteDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        siteName={site.name}
        benchName={benchName}
        availableAppNames={toInstall}
      />

      {/* Backup dialog */}
      <Dialog open={backupOpen} onOpenChange={handleBackupOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!(backupOpId !== null && backupStream.status === "running")}
          onPointerDownOutside={(e) => {
            if (backupOpId !== null && backupStream.status === "running") e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (backupOpId !== null && backupStream.status === "running") e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Backup {site.name}</DialogTitle>
            <DialogDescription>
              Create a database backup for this site using{" "}
              <span className="font-mono text-xs">bench --site {site.name} backup</span>.
            </DialogDescription>
          </DialogHeader>
          {backupOpId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`backup-files-${site.name}`}
                  checked={backupWithFiles}
                  onCheckedChange={(c) => setBackupWithFiles(c === true)}
                />
                <Label htmlFor={`backup-files-${site.name}`} className="cursor-pointer">
                  Include private and public files (--with-files)
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => void handleBackupSubmit()}>
                  Start Backup
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={backupOpId}
                lines={backupStream.lines}
                status={backupStream.status}
                exitCode={backupStream.exitCode}
              />
              {backupStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBackupOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={handleRestoreOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!(restoreOpId !== null && restoreStream.status === "running")}
          onPointerDownOutside={(e) => {
            if (restoreOpId !== null && restoreStream.status === "running") e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (restoreOpId !== null && restoreStream.status === "running") e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Restore {site.name}</DialogTitle>
            <DialogDescription>
              Restore a database backup for this site using{" "}
              <span className="font-mono text-xs">bench --site {site.name} restore</span>.
            </DialogDescription>
          </DialogHeader>
          {restoreOpId === null ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`restore-path-${site.name}`}>
                  Backup file path (relative to bench directory)
                </Label>
                <Input
                  id={`restore-path-${site.name}`}
                  value={restorePath}
                  onChange={(e) => setRestorePath(e.target.value)}
                  placeholder="sites/site.localhost/private/backups/20240101_120000-site_localhost-database.sql.gz"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`restore-pw-${site.name}`}>
                  MariaDB root password
                </Label>
                <Input
                  id={`restore-pw-${site.name}`}
                  type="password"
                  value={restoreDbPassword}
                  onChange={(e) => setRestoreDbPassword(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => void handleRestoreSubmit()}>
                  Start Restore
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <LogStream
                operationId={restoreOpId}
                lines={restoreStream.lines}
                status={restoreStream.status}
                exitCode={restoreStream.exitCode}
              />
              {restoreStream.status !== "running" ? (
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleRestoreOpenChange(false)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </li>
  )
}
