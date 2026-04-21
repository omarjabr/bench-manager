import { useState } from "react"

import { DatabaseDataGrid } from "@/components/database/DatabaseDataGrid"
import { DatabaseSqlRunner } from "@/components/database/DatabaseSqlRunner"
import { DatabaseExplorerSidebar } from "@/components/database/DatabaseExplorerSidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function Database() {
  const [selectedDb, setSelectedDb] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [sqlPanelHeight, setSqlPanelHeight] = useState(220)

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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <h2 className="font-heading mb-4 shrink-0 text-xl font-semibold">
          Database Explorer
        </h2>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-row gap-4 overflow-hidden">
            <DatabaseExplorerSidebar
              selectedDb={selectedDb}
              selectedTable={selectedTable}
              onSelectDatabase={(db) => {
                setSelectedDb(db)
                setSelectedTable(null)
                setPage(1)
              }}
              onSelectTable={(db, table) => {
                setSelectedDb(db)
                setSelectedTable(table)
                setPage(1)
              }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {!selectedTable || !selectedDb ? (
                <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed p-8 text-center text-sm">
                  Select a table to begin
                </div>
              ) : (
                <DatabaseDataGrid
                  dbName={selectedDb}
                  tableName={selectedTable}
                  page={page}
                  onPageChange={setPage}
                />
              )}
            </div>
          </div>
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
              <DatabaseSqlRunner dbName={selectedDb} />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
