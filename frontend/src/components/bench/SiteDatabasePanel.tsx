import {
  ArrowDown01Icon,
  DatabaseIcon,
  InternetIcon,
  Search01Icon,
  Table02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"

import { DatabaseDataGrid } from "@/components/database/DatabaseDataGrid"
import { DatabaseSqlRunner } from "@/components/database/DatabaseSqlRunner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useScopedTables } from "@/hooks/useDatabase"
import { useSiteDatabaseStatus } from "@/hooks/useSiteDatabase"
import { siteDbScope, type SiteInfo } from "@/lib/api"
import { cn } from "@/lib/utils"

type SiteDatabasePanelProps = {
  benchName: string
  sites: SiteInfo[]
}

export function SiteDatabasePanel({ benchName, sites }: SiteDatabasePanelProps) {
  const [selectedSite, setSelectedSite] = useState<string>(
    sites.length > 0 ? sites[0].name : ""
  )
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState("")
  const [page, setPage] = useState(1)
  const [sqlPanelHeight, setSqlPanelHeight] = useState(200)

  const apiScope = useMemo(
    () => (selectedSite ? siteDbScope(benchName, selectedSite) : ""),
    [benchName, selectedSite]
  )

  const { data: status, isLoading: statusLoading } = useSiteDatabaseStatus(
    benchName,
    selectedSite
  )
  const connected = status?.connected === true

  const { data: tables = [], isLoading: tablesLoading } =
    useScopedTables(connected ? apiScope : "")

  useEffect(() => {
    setSelectedTable(null)
    setTableSearch("")
    setPage(1)
  }, [selectedSite])

  const tableQuery = tableSearch.trim().toLowerCase()
  const filteredTables = useMemo(() => {
    if (!tableQuery) return tables
    return tables.filter((t) => t.toLowerCase().includes(tableQuery))
  }, [tables, tableQuery])

  const tableCountLabel = useMemo(() => {
    if (!connected) return ""
    if (!tableQuery) {
      return `${tables.length} ${tables.length === 1 ? "table" : "tables"}`
    }
    return `${filteredTables.length} of ${tables.length} ${tables.length === 1 ? "table" : "tables"}`
  }, [connected, tableQuery, tables.length, filteredTables.length])

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = sqlPanelHeight
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setSqlPanelHeight(Math.min(480, Math.max(120, startH + delta)))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  if (sites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sites in this bench. Create a site first to explore its database.
      </p>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-row gap-4 overflow-hidden">
          {/* Sidebar: site picker + table list */}
          <div className="flex h-full min-h-0 w-56 shrink-0 flex-col gap-3 overflow-hidden border-r border-border pr-3">
            {/* Site picker */}
            <div className="flex shrink-0 flex-col gap-1.5">
              <Label>Site</Label>
              <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={sitePickerOpen}
                    aria-label="Select site"
                    className="h-9 w-full justify-between gap-2 font-normal"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <HugeiconsIcon
                        icon={InternetIcon}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">
                        {selectedSite || "Select site\u2026"}
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className="size-4 shrink-0 opacity-50"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-56 p-0"
                  align="start"
                  sideOffset={4}
                >
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
                            <HugeiconsIcon
                              icon={InternetIcon}
                              className="size-4 shrink-0"
                            />
                            <span className="truncate">{s.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Connection status */}
            <div className="shrink-0">
              {statusLoading ? (
                <Skeleton className="h-6 w-full" />
              ) : (
                <div className="flex flex-col gap-1">
                  <Badge variant={connected ? "default" : "destructive"}>
                    {connected ? "Connected" : "Disconnected"}
                  </Badge>
                  {status && (
                    <p className="text-muted-foreground text-xs">
                      {status.host} · {status.user}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Table list */}
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <Label>Tables</Label>
              {!connected ? (
                <p className="text-muted-foreground text-xs">
                  {selectedSite
                    ? "Cannot connect to this site\u2019s database."
                    : "Select a site to list its tables."}
                </p>
              ) : (
                <>
                  <InputGroup className="max-w-xs w-full shrink-0">
                    <InputGroupInput
                      placeholder="Search tables\u2026"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      aria-label="Search tables by name"
                    />
                    <InputGroupAddon>
                      <HugeiconsIcon icon={Search01Icon} className="size-4" />
                    </InputGroupAddon>
                    <InputGroupAddon align="inline-end">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {tableCountLabel}
                      </span>
                    </InputGroupAddon>
                  </InputGroup>

                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-0.5 pr-3 pb-1">
                      {tablesLoading && (
                        <>
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
                        </>
                      )}
                      {!tablesLoading &&
                        filteredTables.map((t) => (
                          <Button
                            key={t}
                            type="button"
                            variant="ghost"
                            className={cn(
                              "h-8 w-full justify-start gap-2 px-2 font-normal",
                              selectedTable === t && "bg-sidebar-accent"
                            )}
                            onClick={() => {
                              setSelectedTable(t)
                              setPage(1)
                            }}
                          >
                            <HugeiconsIcon
                              icon={Table02Icon}
                              className="size-4 shrink-0"
                            />
                            <span className="truncate">{t}</span>
                          </Button>
                        ))}
                      {!tablesLoading && filteredTables.length === 0 && (
                        <p className="text-muted-foreground px-2 py-4 text-center text-xs">
                          {tableQuery
                            ? "No tables match your search."
                            : "No tables in this database."}
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          </div>

          {/* Main area: data grid */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {!selectedTable || !apiScope || !connected ? (
              <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed p-8 text-center text-sm">
                {!connected
                  ? "Connect to a site\u2019s database to begin"
                  : "Select a table to begin"}
              </div>
            ) : (
              <DatabaseDataGrid
                apiScope={apiScope}
                tableName={selectedTable}
                page={page}
                onPageChange={setPage}
              />
            )}
          </div>
        </div>

        {/* SQL runner */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize query panel"
          className="bg-border hover:bg-muted-foreground/30 h-1.5 shrink-0 cursor-ns-resize rounded-sm"
          onMouseDown={startDrag}
        />
        <div
          className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden border-t pt-2"
          style={{ height: sqlPanelHeight }}
        >
          <h3 className="font-heading shrink-0 text-sm font-medium">
            Query runner
          </h3>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DatabaseSqlRunner
              apiScope={connected ? apiScope : null}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
