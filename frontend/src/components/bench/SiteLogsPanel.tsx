import {
  ArrowDown01Icon,
  ComputerTerminal01Icon,
  Copy01Icon,
  InternetIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useSiteLogFiles, useSiteLogTail } from "@/hooks/useSiteLogs"
import { getLogTailWebSocketUrl, type SiteInfo } from "@/lib/api"
import { useUiStore } from "@/stores/ui.store"

import "@xterm/xterm/css/xterm.css"

type SiteLogsPanelProps = {
  benchName: string
  sites: SiteInfo[]
}

export function SiteLogsPanel({ benchName, sites }: SiteLogsPanelProps) {
  const theme = useUiStore((s) => s.theme)
  const [selectedSite, setSelectedSite] = useState<string>(
    sites.length > 0 ? sites[0].name : "",
  )
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<string>("")
  const [liveMode, setLiveMode] = useState(false)

  const {
    data: logFiles,
    isLoading: filesLoading,
    refetch: refetchFiles,
  } = useSiteLogFiles(benchName, selectedSite)

  const {
    data: tailData,
    isLoading: tailLoading,
    refetch: refetchTail,
  } = useSiteLogTail(benchName, selectedSite, liveMode ? "" : selectedLog)

  useEffect(() => {
    setSelectedLog("")
    setLiveMode(false)
  }, [selectedSite])

  useEffect(() => {
    if (logFiles && logFiles.length > 0 && selectedLog === "") {
      setSelectedLog(logFiles[0].name)
    }
  }, [logFiles, selectedLog])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const lines = useMemo(
    () => (tailData ? tailData.lines : []),
    [tailData],
  )

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const term = new Terminal({
      cursorInactiveStyle: "outline",
      theme:
        theme === "dark"
          ? { background: "#1e1e1e", foreground: "#d4d4d4" }
          : { background: "#ffffff", foreground: "#1e1e1e" },
      disableStdin: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    terminalRef.current = term
    fitRef.current = fit

    const onResize = () => fit.fit()
    window.addEventListener("resize", onResize)
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(container)

    return () => {
      window.removeEventListener("resize", onResize)
      observer.disconnect()
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [theme])

  useEffect(() => {
    const term = terminalRef.current
    if (term === null) return
    if (liveMode) return
    term.reset()
    for (const line of lines) {
      term.writeln(line)
    }
    term.scrollToBottom()
  }, [lines, liveMode])

  useEffect(() => {
    if (!liveMode || selectedLog === "" || selectedSite === "") return
    const term = terminalRef.current
    if (term === null) return
    term.reset()

    const url = getLogTailWebSocketUrl(benchName, selectedSite, selectedLog)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event: MessageEvent<string>) => {
      term.writeln(event.data)
    }
    ws.onerror = () => {
      term.writeln("\r\n[WebSocket error — live tail disconnected]")
    }
    ws.onclose = () => {
      term.writeln("\r\n[Live tail ended]")
    }

    return () => {
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close()
      }
      wsRef.current = null
    }
  }, [liveMode, selectedLog, selectedSite, benchName])

  const handleCopy = useCallback(async () => {
    const text = lines.join("\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard may be unavailable */
    }
  }, [lines])

  if (sites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sites in this bench. Create a site first to view logs.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Site picker */}
        <div className="flex flex-col gap-1.5">
          <Label>Site</Label>
          <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={sitePickerOpen}
                aria-label="Select site"
                className="h-9 w-56 justify-between gap-2 font-normal"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <HugeiconsIcon icon={InternetIcon} className="size-4 shrink-0" />
                  <span className="truncate">{selectedSite || "Select site\u2026"}</span>
                </span>
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start" sideOffset={4}>
              <Command>
                <CommandInput placeholder="Search sites\u2026" />
                <CommandList>
                  <CommandEmpty>No site found.</CommandEmpty>
                  <CommandGroup>
                    {sites.map((s) => (
                      <CommandItem
                        key={s.name}
                        value={s.name}
                        onSelect={() => {
                          setSelectedSite(s.name)
                          setSitePickerOpen(false)
                        }}
                      >
                        <HugeiconsIcon icon={InternetIcon} className="size-4 shrink-0" />
                        <span className="truncate">{s.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Log file picker */}
        <div className="flex flex-col gap-1.5">
          <Label>Log file</Label>
          {filesLoading ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <Select value={selectedLog} onValueChange={setSelectedLog}>
              <SelectTrigger className="w-48">
                <HugeiconsIcon icon={ComputerTerminal01Icon} className="size-4 shrink-0" />
                <SelectValue placeholder="Select log\u2026" />
              </SelectTrigger>
              <SelectContent>
                {(logFiles ?? []).map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={liveMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            disabled={selectedLog === ""}
            onClick={() => setLiveMode((prev) => !prev)}
          >
            {liveMode ? <Spinner className="size-4" /> : null}
            {liveMode ? "Stop live tail" : "Live tail"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={liveMode || selectedLog === ""}
            onClick={() => {
              void refetchFiles()
              void refetchTail()
            }}
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={liveMode}
            onClick={() => void handleCopy()}
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-4" />
            Copy
          </Button>
        </div>
      </div>

      {/* Terminal */}
      <div className="relative">
        {tailLoading && !liveMode ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Spinner className="size-6" />
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="h-[400px] w-full overflow-hidden rounded-lg border border-border bg-background"
        />
      </div>
    </div>
  )
}
