import axios from "axios"

const api = axios.create({
  baseURL: "http://localhost:8000",
})

/** Extracts a user-facing message from an API or network error. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data === "object" && data !== null && "detail" in data) {
      const detail = (data as { detail: unknown }).detail
      if (typeof detail === "string") {
        return detail
      }
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

export type BenchStatus = "running" | "stopped" | "unknown"

export type AppInfo = {
  name: string
  version: string
}

export type SiteInfo = {
  name: string
  installed_apps: AppInfo[]
}

export type BenchSummary = {
  name: string
  path: string
  frappe_version: string
  status: BenchStatus
  site_count: number
  app_count: number
  /** Present when merged from live WebSocket updates or detail fetch. */
  pid?: number | null
}

export type BenchDetail = {
  name: string
  path: string
  frappe_version: string
  status: BenchStatus
  site_count: number
  app_count: number
  sites: SiteInfo[]
  apps: AppInfo[]
  pid: number | null
  ports: Record<string, string>
}

export type Settings = {
  root_scan_dir: string
  excluded_paths: string[]
  scan_interval_seconds: number
  backend_host: string
  backend_port: number
  db_host: string
  db_user: string
  db_password: string
}

export type DatabaseStatus = {
  connected: boolean
  host: string
  user: string
}

export type ColumnMeta = {
  name: string
  type: string
  nullable: boolean
  key: string
  default: unknown
}

export type TableRowsResponse = {
  columns: string[]
  rows: unknown[][]
  total: number
  page: number
  page_size: number
}

export type UpdateCellRequest = {
  primary_key_col: string
  primary_key_val: string
  column: string
  value: string
}

export type DeleteRowRequest = {
  primary_key_col: string
  primary_key_val: string
}

export type QueryResult = {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
  total: number
}

export async function getBenches(): Promise<BenchSummary[]> {
  const res = await api.get<BenchSummary[]>("/api/benches")
  return res.data
}

export async function getBench(name: string): Promise<BenchDetail> {
  const res = await api.get<BenchDetail>(
    `/api/benches/${encodeURIComponent(name)}`
  )
  return res.data
}

export async function startBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/start`)
}

export async function stopBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/stop`)
}

export async function restartBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/restart`)
}

export async function getSettings(): Promise<Settings> {
  const res = await api.get<Settings>("/api/settings")
  return res.data
}

export async function updateSettings(
  data: Partial<Settings>
): Promise<Settings> {
  const current = await getSettings()
  const body: Settings = {
    root_scan_dir: data.root_scan_dir ?? current.root_scan_dir,
    excluded_paths: data.excluded_paths ?? current.excluded_paths,
    scan_interval_seconds:
      data.scan_interval_seconds ?? current.scan_interval_seconds,
    backend_host: data.backend_host ?? current.backend_host,
    backend_port: data.backend_port ?? current.backend_port,
    db_host: data.db_host ?? current.db_host,
    db_user: data.db_user ?? current.db_user,
    db_password: data.db_password ?? current.db_password,
  }
  const res = await api.put<Settings>("/api/settings", body)
  return res.data
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const res = await api.get<DatabaseStatus>("/api/database/status")
  return res.data
}

export async function getDatabases(): Promise<string[]> {
  const res = await api.get<string[]>("/api/database/databases")
  return res.data
}

export async function getDatabaseTables(dbName: string): Promise<string[]> {
  const res = await api.get<string[]>(
    `/api/database/${encodeURIComponent(dbName)}/tables`
  )
  return res.data
}

export async function getTableColumns(
  dbName: string,
  tableName: string
): Promise<ColumnMeta[]> {
  const res = await api.get<ColumnMeta[]>(
    `/api/database/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}/columns`
  )
  return res.data
}

export async function getTableRows(
  dbName: string,
  tableName: string,
  page: number,
  pageSize = 25
): Promise<TableRowsResponse> {
  const res = await api.get<TableRowsResponse>(
    `/api/database/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}/rows`,
    { params: { page, page_size: pageSize } }
  )
  return res.data
}

export async function updateCell(
  dbName: string,
  tableName: string,
  body: UpdateCellRequest
): Promise<void> {
  await api.patch(
    `/api/database/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}/rows`,
    body
  )
}

export async function deleteRow(
  dbName: string,
  tableName: string,
  body: DeleteRowRequest
): Promise<void> {
  await api.delete(
    `/api/database/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}/rows`,
    { data: body }
  )
}

export async function runQuery(
  dbName: string,
  body: { sql: string }
): Promise<QueryResult> {
  const res = await api.post<QueryResult>(
    `/api/database/${encodeURIComponent(dbName)}/query`,
    body
  )
  return res.data
}

export type InitAppItem = {
  name: string
  repo_url: string
  branch?: string
}

export type InitOperationBody = {
  bench_name: string
  parent_dir: string
  frappe_version: "version-15" | "version-14" | "develop"
  site_name: string
  admin_password: string
  db_root_password: string
  apps: InitAppItem[]
  /** Passed to ``bench init --python``; default matches backend. */
  python_version: string
}

export type OperationIdResponse = {
  operation_id: string
}

export async function postOperationInit(
  body: InitOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>("/api/operations/init", body)
  return res.data
}

export type TemplateApp = {
  name: string
  repo_url: string
  branch?: string
}

export type Template = {
  id: string
  name: string
  frappe_version: string
  apps: TemplateApp[]
  created_at: string
  last_used_at: string | null
}

export type TemplateCreate = {
  name: string
  frappe_version: string
  apps: TemplateApp[]
}

export async function getTemplates(): Promise<Template[]> {
  const res = await api.get<Template[]>("/api/templates")
  return res.data
}

export async function createTemplate(data: TemplateCreate): Promise<Template> {
  const res = await api.post<Template>("/api/templates", data)
  return res.data
}

export async function updateTemplate(
  id: string,
  data: TemplateCreate
): Promise<Template> {
  const res = await api.put<Template>(
    `/api/templates/${encodeURIComponent(id)}`,
    data
  )
  return res.data
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/api/templates/${encodeURIComponent(id)}`)
}

export async function useTemplate(id: string): Promise<Template> {
  const res = await api.post<Template>(
    `/api/templates/${encodeURIComponent(id)}/use`
  )
  return res.data
}

export type GetAppOperationBody = {
  bench_name: string
  repo_url: string
  branch?: string
}

export async function postOperationGetApp(
  body: GetAppOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/get-app",
    body
  )
  return res.data
}

export type NewSiteOperationBody = {
  bench_name: string
  site_name: string
  admin_password: string
  db_root_password: string
  apps: string[]
}

export async function postOperationNewSite(
  body: NewSiteOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/new-site",
    body
  )
  return res.data
}

export type InstallAppOnSiteBody = {
  bench_name: string
  site_name: string
  apps: string[]
}

export async function postOperationInstallAppOnSite(
  body: InstallAppOnSiteBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/install-app",
    body
  )
  return res.data
}

/**
 * WebSocket URL for streaming operation logs (matches the axios ``baseURL`` host).
 */
export function getOperationsWebSocketUrl(operationId: string): string {
  const base =
    typeof api.defaults.baseURL === "string"
      ? api.defaults.baseURL
      : "http://localhost:8000"
  const parsed = new URL(base)
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:"
  return `${wsScheme}//${parsed.host}/ws/operations/${encodeURIComponent(operationId)}`
}
