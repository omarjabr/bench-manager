import {
  ArrowLeft02Icon,
  File01Icon,
  File02Icon,
  FileCodeIcon,
  FileImageIcon,
  Folder02FreeIcons,
  Home01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getBenchFiles, type FileEntry } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

type FileExplorerProps = {
  benchName: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(timestamp: number): string {
  if (timestamp === 0) return "—"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000))
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === "directory") {
    return Folder02FreeIcons
  }

  const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""

  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) {
    return FileImageIcon
  }
  if (["js", "ts", "jsx", "tsx", "py", "json", "html", "css", "xml"].includes(ext)) {
    return FileCodeIcon
  }
  if (["txt", "md", "log", "csv", "cfg", "conf", "ini"].includes(ext)) {
    return File01Icon
  }

  return File02Icon
}

export function FileExplorer({ benchName }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState("")
  const serverId = useUiStore((s) => s.currentServerId)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bench-files", benchName, currentPath, serverId],
    queryFn: () => getBenchFiles(benchName, currentPath, serverId),
    staleTime: 10_000,
  })

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
  }, [])

  const navigateUp = useCallback(() => {
    const parts = currentPath.split("/").filter(Boolean)
    parts.pop()
    setCurrentPath(parts.join("/"))
  }, [currentPath])

  const handleEntryClick = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "directory") {
        const newPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name
        navigateTo(newPath)
      }
    },
    [currentPath, navigateTo],
  )

  const breadcrumbs = currentPath.split("/").filter(Boolean)
  const isAtRoot = currentPath === "" || currentPath === "."

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isAtRoot}
          onClick={() => navigateTo("")}
          aria-label="Go to root"
        >
          <HugeiconsIcon icon={Home01Icon} className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isAtRoot}
          onClick={navigateUp}
          aria-label="Go up one level"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
        </Button>

        <div className="flex items-center gap-1 overflow-x-auto text-sm">
          <button
            type="button"
            className="shrink-0 font-medium text-primary hover:underline"
            onClick={() => navigateTo("")}
          >
            sites
          </button>
          {breadcrumbs.map((segment, index) => {
            const segmentPath = breadcrumbs.slice(0, index + 1).join("/")
            const isLast = index === breadcrumbs.length - 1
            return (
              <span key={segmentPath} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                {isLast ? (
                  <span className="shrink-0 font-medium">{segment}</span>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 text-primary hover:underline"
                    onClick={() => navigateTo(segmentPath)}
                  >
                    {segment}
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load files."}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data && data.entries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Name</TableHead>
                <TableHead className="w-[25%]">Size</TableHead>
                <TableHead className="w-[25%]">Last Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => {
                const icon = getFileIcon(entry)
                const isDir = entry.type === "directory"
                return (
                  <TableRow
                    key={entry.name}
                    className={isDir ? "cursor-pointer hover:bg-muted/60" : ""}
                    onClick={() => handleEntryClick(entry)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon
                          icon={icon}
                          className={`size-4 shrink-0 ${
                            isDir
                              ? "text-amber-500 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        />
                        <span
                          className={`truncate ${
                            isDir ? "font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {entry.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatFileSize(entry.size)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(entry.mtime)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : data ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <HugeiconsIcon
            icon={Folder02FreeIcons}
            className="size-8 text-muted-foreground/50"
          />
          <p className="text-sm text-muted-foreground">
            This directory is empty.
          </p>
        </div>
      ) : null}
    </div>
  )
}
