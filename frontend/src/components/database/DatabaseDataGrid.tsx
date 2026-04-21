import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTableColumns, useTableRows } from "@/hooks/useDatabase"
import { deleteRow, getApiErrorMessage, updateCell } from "@/lib/api"
import { formatCellValue } from "@/lib/databaseDisplay"

import { TruncatedCell } from "./TruncatedCell"

const stickyActionsHeadClass =
  "sticky right-0 z-30 w-24 border-l border-border bg-card text-right"

const stickyActionsCellClass =
  "sticky right-0 z-10 w-24 border-l border-border bg-card text-right group-hover:bg-muted/50"

type DatabaseDataGridProps = {
  dbName: string
  tableName: string
  page: number
  onPageChange: (page: number) => void
}

export function DatabaseDataGrid({
  dbName,
  tableName,
  page,
  onPageChange,
}: DatabaseDataGridProps) {
  const queryClient = useQueryClient()
  const { data: columns = [], isLoading: colsLoading } = useTableColumns(
    dbName,
    tableName
  )
  const { data: rowsData, isLoading: rowsLoading } = useTableRows(
    dbName,
    tableName,
    page
  )

  const pkCol = useMemo(
    () => columns.find((c) => c.key === "PRI")?.name ?? null,
    [columns]
  )

  const [editingPk, setEditingPk] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [deletePk, setDeletePk] = useState<string | null>(null)

  const loading = colsLoading || rowsLoading

  const startEdit = (row: unknown[]) => {
    if (!pkCol || !rowsData) return
    const pkIndex = rowsData.columns.indexOf(pkCol)
    if (pkIndex < 0) return
    const pkVal = formatCellValue(row[pkIndex])
    setEditingPk(pkVal)
    const next: Record<string, string> = {}
    rowsData.columns.forEach((col, i) => {
      next[col] = formatCellValue(row[i])
    })
    setDraft(next)
  }

  const cancelEdit = () => {
    setEditingPk(null)
    setDraft({})
  }

  const saveEdit = async () => {
    if (!pkCol || editingPk === null || !rowsData) return
    const originalRow = rowsData.rows.find((r) => {
      const idx = rowsData.columns.indexOf(pkCol)
      return formatCellValue(r[idx]) === editingPk
    })
    if (!originalRow) {
      cancelEdit()
      return
    }
    try {
      for (const col of rowsData.columns) {
        if (col === pkCol) continue
        const i = rowsData.columns.indexOf(col)
        const before = formatCellValue(originalRow[i])
        const after = draft[col] ?? ""
        if (before !== after) {
          await updateCell(dbName, tableName, {
            primary_key_col: pkCol,
            primary_key_val: editingPk,
            column: col,
            value: after,
          })
        }
      }
      toast.success("Row updated")
      cancelEdit()
      await queryClient.invalidateQueries({
        queryKey: ["database", "rows", dbName, tableName],
      })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const confirmDelete = async () => {
    if (!pkCol || deletePk === null) return
    try {
      await deleteRow(dbName, tableName, {
        primary_key_col: pkCol,
        primary_key_val: deletePk,
      })
      toast.success("Row deleted")
      setDeletePk(null)
      await queryClient.invalidateQueries({
        queryKey: ["database", "rows", dbName, tableName],
      })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (!rowsData) {
    return null
  }

  const totalPages = Math.max(1, Math.ceil(rowsData.total / rowsData.page_size))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ScrollArea
        scrollBothAxes
        className="min-h-0 flex-1 rounded-md border"
      >
        <Table
          containerClassName="overflow-visible"
          className="w-max min-w-full"
        >
          <TableHeader>
            <TableRow>
              {rowsData.columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
              {pkCol && (
                <TableHead className={stickyActionsHeadClass}>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsData.rows.map((row, ri) => {
              const pkIndex = pkCol ? rowsData.columns.indexOf(pkCol) : -1
              const pkVal =
                pkIndex >= 0 ? formatCellValue(row[pkIndex]) : ""
              const isEditing = pkCol && editingPk === pkVal

              return (
                <TableRow key={`${ri}-${pkVal}`} className="group">
                  {rowsData.columns.map((col, ci) => {
                    const cell = row[ci]
                    const text = isEditing
                      ? (draft[col] ?? "")
                      : formatCellValue(cell)
                    return (
                      <TableCell key={col} className="max-w-[min(20rem,40vw)]">
                        {isEditing ? (
                          <Input
                            value={draft[col] ?? ""}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [col]: e.target.value,
                              }))
                            }
                            className="font-heading h-8 text-xs"
                          />
                        ) : (
                          <TruncatedCell text={text} className="font-heading text-xs" />
                        )}
                      </TableCell>
                    )
                  })}
                  {pkCol && (
                    <TableCell className={stickyActionsCellClass}>
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => void saveEdit()}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label="Edit row"
                            onClick={() => startEdit(row)}
                          >
                            <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label="Delete row"
                            onClick={() => setDeletePk(pkVal)}
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {!pkCol && (
        <p className="text-muted-foreground text-sm">
          This table has no primary key column; edit and delete are disabled.
        </p>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {rowsData.total} row{rowsData.total === 1 ? "" : "s"} total
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AlertDialog
        open={deletePk !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePk(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete row?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this row? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
