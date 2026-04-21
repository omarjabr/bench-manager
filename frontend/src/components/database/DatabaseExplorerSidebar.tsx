import {
  ArrowDown01Icon,
  DatabaseIcon,
  Search01Icon,
  Table02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

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
import {
  useDatabases,
  useDatabaseStatus,
  useDatabaseTables,
} from "@/hooks/useDatabase"
import { cn } from "@/lib/utils"

type DatabaseExplorerSidebarProps = {
  selectedDb: string | null
  selectedTable: string | null
  onSelectDatabase: (db: string) => void
  onSelectTable: (db: string, table: string) => void
}

export function DatabaseExplorerSidebar({
  selectedDb,
  selectedTable,
  onSelectDatabase,
  onSelectTable,
}: DatabaseExplorerSidebarProps) {
  const { data: status, isLoading: statusLoading } = useDatabaseStatus()
  const { data: databases = [], isLoading: dbsLoading } = useDatabases()
  const [dbPickerOpen, setDbPickerOpen] = useState(false)
  const [tableSearch, setTableSearch] = useState("")

  const connected = status?.connected === true
  const activeDb = selectedDb ?? ""

  useEffect(() => {
    setTableSearch("")
  }, [selectedDb])

  const { data: tables = [], isLoading: tablesLoading } =
    useDatabaseTables(activeDb)

  const tableQuery = tableSearch.trim().toLowerCase()
  const tableList = useMemo(() => {
    if (!tableQuery) {
      return tables
    }
    return tables.filter((t) => t.toLowerCase().includes(tableQuery))
  }, [tables, tableQuery])

  const tableCountLabel = useMemo(() => {
    if (!selectedDb) {
      return ""
    }
    if (!tableQuery) {
      return `${tables.length} ${tables.length === 1 ? "table" : "tables"}`
    }
    return `${tableList.length} of ${tables.length} ${tables.length === 1 ? "table" : "tables"}`
  }, [selectedDb, tableQuery, tables.length, tableList.length])

  return (
    <div className="flex h-full min-h-0 w-56 shrink-0 flex-col gap-3 overflow-hidden border-r border-border pr-3">
      <div className="shrink-0 space-y-1">
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
            {!connected && (
              <Button
                variant="link"
                className="h-auto justify-start p-0 text-xs"
                asChild
              >
                <Link to="/settings#database-connection">
                  Configure in Settings
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        <Label htmlFor="database-picker-trigger">Database</Label>
        {dbsLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Popover open={dbPickerOpen} onOpenChange={setDbPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                id="database-picker-trigger"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={dbPickerOpen}
                aria-label="Search and select database"
                className="h-9 w-full justify-between gap-2 font-normal"
                disabled={!connected || databases.length === 0}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <HugeiconsIcon
                    icon={DatabaseIcon}
                    className="size-4 shrink-0"
                  />
                  <span className="truncate">
                    {selectedDb ?? "Select database…"}
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
                <CommandInput
                  placeholder="Search databases…"
                  aria-label="Search databases"
                />
                <CommandList>
                  <CommandEmpty>No database found.</CommandEmpty>
                  <CommandGroup>
                    {databases.map((dbName) => (
                      <CommandItem
                        key={dbName}
                        value={dbName}
                        onSelect={() => {
                          onSelectDatabase(dbName)
                          setDbPickerOpen(false)
                          setTableSearch("")
                        }}
                      >
                        <HugeiconsIcon
                          icon={DatabaseIcon}
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">{dbName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <Label htmlFor="table-search">Tables</Label>
        {!selectedDb ? (
          <p className="text-muted-foreground text-xs">
            Select a database to list its tables.
          </p>
        ) : (
          <>
            <InputGroup className="max-w-xs w-full shrink-0">
              <InputGroupInput
                id="table-search"
                placeholder="Search tables…"
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
                  tableList.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-8 w-full justify-start gap-2 px-2 font-normal",
                        selectedTable === t && "bg-sidebar-accent"
                      )}
                      onClick={() => onSelectTable(activeDb, t)}
                    >
                      <HugeiconsIcon
                        icon={Table02Icon}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">{t}</span>
                    </Button>
                  ))}
                {!tablesLoading && tableList.length === 0 && (
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
  )
}
