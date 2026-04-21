/** Render a cell value for display in the Database Explorer grids. */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL"
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}
