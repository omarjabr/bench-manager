import { Copy01Icon, Download01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { useCallback, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useUiStore } from "@/stores/ui.store"

import "@xterm/xterm/css/xterm.css"

type LogStreamProps = {
  operationId: string
  lines: string[]
  status: "running" | "done" | "error" | "null"
  exitCode: number | null
}

export function LogStream({
  operationId,
  lines,
  status,
  exitCode,
}: LogStreamProps) {
  const theme = useUiStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const writtenCountRef = useRef(0)
  const linesRef = useRef(lines)
  linesRef.current = lines

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

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

    writtenCountRef.current = 0
    for (const line of linesRef.current) {
      term.writeln(line)
    }
    writtenCountRef.current = linesRef.current.length
    term.scrollToBottom()

    const onResize = () => {
      fit.fit()
    }
    window.addEventListener("resize", onResize)
    const observer = new ResizeObserver(() => {
      fit.fit()
    })
    observer.observe(container)

    return () => {
      window.removeEventListener("resize", onResize)
      observer.disconnect()
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
      writtenCountRef.current = 0
    }
  }, [theme])

  useEffect(() => {
    const term = terminalRef.current
    if (term === null) {
      return
    }
    if (lines.length === 0) {
      term.reset()
      writtenCountRef.current = 0
      return
    }
    if (lines.length < writtenCountRef.current) {
      term.reset()
      writtenCountRef.current = 0
    }
    for (let i = writtenCountRef.current; i < lines.length; i += 1) {
      term.writeln(lines[i])
    }
    writtenCountRef.current = lines.length
    term.scrollToBottom()
  }, [lines])

  const handleCopy = useCallback(async () => {
    const text = lines.join("\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard may be unavailable */
    }
  }, [lines])

  const handleDownload = useCallback(() => {
    const text = lines.join("\n")
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `operation-${operationId}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [lines, operationId])

  const success = status === "done" && exitCode !== null && exitCode === 0
  const failure = status === "error" || (status === "done" && exitCode !== 0)

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="h-64 min-h-48 w-full overflow-hidden rounded-lg border border-border bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-2 text-sm">
          {status === "running" ? (
            <>
              <Spinner className="size-4" />
              <span className="text-muted-foreground">Running…</span>
            </>
          ) : null}
          {success ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓ Completed
              {exitCode !== null ? ` (exit ${exitCode})` : ""}
            </span>
          ) : null}
          {failure ? (
            <span className="text-destructive">
              ✗ Failed
              {exitCode !== null ? ` (exit ${exitCode})` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void handleCopy()}
          >
            <HugeiconsIcon icon={Copy01Icon} className="size-4" />
            Copy output
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDownload}
          >
            <HugeiconsIcon icon={Download01Icon} className="size-4" />
            Download log
          </Button>
        </div>
      </div>
    </div>
  )
}
