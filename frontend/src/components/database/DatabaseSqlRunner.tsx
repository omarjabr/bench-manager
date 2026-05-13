import { useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage, scopedRunQuery, type QueryResult } from "@/lib/api"
import { formatCellValue } from "@/lib/databaseDisplay"
import { useUiStore } from "@/stores/ui.store"

import { TruncatedCell } from "./TruncatedCell"

type DatabaseSqlRunnerProps = {
  apiScope: string | null
}

export function DatabaseSqlRunner({ apiScope }: DatabaseSqlRunnerProps) {
  const serverId = useUiStore((s) => s.currentServerId)
  const [sqlText, setSqlText] = useState("")
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const execute = async () => {
    if (!apiScope) return
    const sql = sqlText.trim()
    if (!sql) return
    setError(null)
    setRunning(true)
    try {
      const data = await scopedRunQuery(apiScope, { sql }, serverId)
      setResult(data)
    } catch (e) {
      setResult(null)
      setError(getApiErrorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void execute()
    }
  }

  if (!apiScope) {
    return (
      <p className="text-sm text-muted-foreground">Select a database first</p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Textarea
        value={sqlText}
        onChange={(e) => setSqlText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="SELECT …"
        className="min-h-20 resize-y font-heading text-sm"
        aria-label="SQL query"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={running}
          onClick={() => void execute()}
        >
          Run Query
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result?.truncated && (
        <p className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">
          Results capped at 500 rows.
        </p>
      )}
      {result && result.columns.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, ri) => (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={result.columns[ci] ?? ci}>
                      <TruncatedCell
                        text={formatCellValue(cell)}
                        className="font-heading text-xs"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
