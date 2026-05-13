import axios from "axios"

const api = axios.create({
  baseURL: "http://localhost:8000",
})

/**
 * Return ``{ server: id }`` when *serverId* is not ``"local"``, otherwise
 * an empty object.  Spread into ``params`` to include the server query param
 * only when targeting a remote server.
 */
export function withServer(
  serverId: string | undefined,
): Record<string, string> {
  if (!serverId || serverId === "local") return {}
  return { server: serverId }
}

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

export type OperationIdResponse = {
  operation_id: string
}

export type SystemCheckStatus = "pass" | "fail" | "warn" | "unknown"
export type SystemCheckFixKind = "auto" | "manual" | "none"
export type FixGroupId =
  | "apt_packages"
  | "python_venv"
  | "npm_apt"
  | "yarn_global"
  | "frappe_bench"
  | "ansible"
  | "mariadb_running"
  | "mariadb_charset"
  | "redis_running"
  | "nvm_installed"
  | "node_18"
  | "mysql_secured"

export type SystemCheckItem = {
  id: FixGroupId
  label: string
  status: SystemCheckStatus
  details: string
  fix_kind: SystemCheckFixKind
  manual_commands: string[]
}

export type SystemCheckReport = {
  items: SystemCheckItem[]
  ready: boolean
}

/* ------------------------------------------------------------------ */
/*  Servers                                                            */
/* ------------------------------------------------------------------ */

export type ServerStatus = "disconnected" | "connecting" | "connected" | "error"

export type ServerRecord = {
  id: string
  nickname: string
  host: string
  ssh_user: string
  ssh_key_path: string
  remote_agent_port: number
  local_tunnel_port: number | null
  status: ServerStatus
  agent_deployed: boolean
  last_connected_at: string | null
  agent_version: string | null
  created_at: string | null
}

export type ServerCreatePayload = {
  id: string
  nickname: string
  host: string
  ssh_user: string
  ssh_key_path?: string
  remote_agent_port?: number
}

export type ServerUpdatePayload = {
  nickname?: string
  host?: string
  ssh_user?: string
  ssh_key_path?: string
  remote_agent_port?: number
}

export async function getServers(): Promise<ServerRecord[]> {
  const res = await api.get<ServerRecord[]>("/api/servers")
  return res.data
}

export async function getServer(serverId: string): Promise<ServerRecord> {
  const res = await api.get<ServerRecord>(
    `/api/servers/${encodeURIComponent(serverId)}`,
  )
  return res.data
}

export async function createServer(
  body: ServerCreatePayload,
): Promise<ServerRecord> {
  const res = await api.post<ServerRecord>("/api/servers", body)
  return res.data
}

export async function updateServer(
  serverId: string,
  body: ServerUpdatePayload,
): Promise<ServerRecord> {
  const res = await api.put<ServerRecord>(
    `/api/servers/${encodeURIComponent(serverId)}`,
    body,
  )
  return res.data
}

export async function deleteServer(serverId: string): Promise<void> {
  await api.delete(`/api/servers/${encodeURIComponent(serverId)}`)
}

export async function connectServer(
  serverId: string,
): Promise<ServerRecord> {
  const res = await api.post<ServerRecord>(
    `/api/servers/${encodeURIComponent(serverId)}/connect`,
  )
  return res.data
}

export async function disconnectServer(
  serverId: string,
): Promise<ServerRecord> {
  const res = await api.post<ServerRecord>(
    `/api/servers/${encodeURIComponent(serverId)}/disconnect`,
  )
  return res.data
}

export async function deployServerAgent(
  serverId: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    `/api/servers/${encodeURIComponent(serverId)}/deploy`,
  )
  return res.data
}

/* ------------------------------------------------------------------ */
/*  Benches                                                            */
/* ------------------------------------------------------------------ */

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

export type AppRegistryEntry = {
  name: string
  repo_url: string
  default_branch: string
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
  app_registry: AppRegistryEntry[]
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

export async function getBenches(serverId?: string): Promise<BenchSummary[]> {
  const res = await api.get<BenchSummary[]>("/api/benches", {
    params: withServer(serverId),
  })
  return res.data
}

export async function getBench(
  name: string,
  serverId?: string,
): Promise<BenchDetail> {
  const res = await api.get<BenchDetail>(
    `/api/benches/${encodeURIComponent(name)}`,
    { params: withServer(serverId) },
  )
  return res.data
}

export async function startBench(
  name: string,
  serverId?: string,
): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/start`, null, {
    params: withServer(serverId),
  })
}

export async function stopBench(
  name: string,
  serverId?: string,
): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/stop`, null, {
    params: withServer(serverId),
  })
}

export async function restartBench(
  name: string,
  serverId?: string,
): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/restart`, null, {
    params: withServer(serverId),
  })
}

export async function getSettings(serverId?: string): Promise<Settings> {
  const res = await api.get<Settings>("/api/settings", {
    params: withServer(serverId),
  })
  return res.data
}

export async function updateSettings(
  data: Partial<Settings>,
  serverId?: string,
): Promise<Settings> {
  const res = await api.put<Settings>("/api/settings", data, {
    params: withServer(serverId),
  })
  return res.data
}

/**
 * Build the global Database Explorer scope for a given database name.
 * Result is used as the ``apiScope`` prefix for table/row/query calls.
 */
export function globalDbScope(dbName: string): string {
  return `/api/database/${encodeURIComponent(dbName)}`
}

/**
 * Build the per-site Database Explorer scope.
 */
export function siteDbScope(benchName: string, siteName: string): string {
  return `/api/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/database`
}

export async function getDatabaseStatus(
  serverId?: string,
): Promise<DatabaseStatus> {
  const res = await api.get<DatabaseStatus>("/api/database/status", {
    params: withServer(serverId),
  })
  return res.data
}

export async function getDatabases(serverId?: string): Promise<string[]> {
  const res = await api.get<string[]>("/api/database/databases", {
    params: withServer(serverId),
  })
  return res.data
}

export async function getSiteDatabaseStatus(
  benchName: string,
  siteName: string,
  serverId?: string,
): Promise<DatabaseStatus> {
  const res = await api.get<DatabaseStatus>(
    `${siteDbScope(benchName, siteName)}/status`,
    { params: withServer(serverId) },
  )
  return res.data
}

export async function getScopedTables(
  apiScope: string,
  serverId?: string,
): Promise<string[]> {
  const res = await api.get<string[]>(`${apiScope}/tables`, {
    params: withServer(serverId),
  })
  return res.data
}

export async function getScopedTableColumns(
  apiScope: string,
  tableName: string,
  serverId?: string,
): Promise<ColumnMeta[]> {
  const res = await api.get<ColumnMeta[]>(
    `${apiScope}/${encodeURIComponent(tableName)}/columns`,
    { params: withServer(serverId) },
  )
  return res.data
}

export async function getScopedTableRows(
  apiScope: string,
  tableName: string,
  page: number,
  pageSize = 25,
  serverId?: string,
): Promise<TableRowsResponse> {
  const res = await api.get<TableRowsResponse>(
    `${apiScope}/${encodeURIComponent(tableName)}/rows`,
    { params: { page, page_size: pageSize, ...withServer(serverId) } },
  )
  return res.data
}

export async function scopedUpdateCell(
  apiScope: string,
  tableName: string,
  body: UpdateCellRequest,
  serverId?: string,
): Promise<void> {
  await api.patch(
    `${apiScope}/${encodeURIComponent(tableName)}/rows`,
    body,
    { params: withServer(serverId) },
  )
}

export async function scopedDeleteRow(
  apiScope: string,
  tableName: string,
  body: DeleteRowRequest,
  serverId?: string,
): Promise<void> {
  await api.delete(
    `${apiScope}/${encodeURIComponent(tableName)}/rows`,
    { data: body, params: withServer(serverId) },
  )
}

export async function scopedRunQuery(
  apiScope: string,
  body: { sql: string },
  serverId?: string,
): Promise<QueryResult> {
  const res = await api.post<QueryResult>(
    `${apiScope}/query`,
    body,
    { params: withServer(serverId) },
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

export async function postOperationInit(
  body: InitOperationBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>("/api/operations/init", body, {
    params: withServer(serverId),
  })
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
  body: GetAppOperationBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/get-app",
    body,
    { params: withServer(serverId) },
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
  body: NewSiteOperationBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/new-site",
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

export type InstallAppOnSiteBody = {
  bench_name: string
  site_name: string
  apps: string[]
}

export async function postOperationInstallAppOnSite(
  body: InstallAppOnSiteBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/install-app",
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

/**
 * WebSocket URL for streaming operation logs (matches the axios ``baseURL`` host).
 */
export function getOperationsWebSocketUrl(
  operationId: string,
  serverId?: string,
): string {
  const base =
    typeof api.defaults.baseURL === "string"
      ? api.defaults.baseURL
      : "http://localhost:8000"
  const parsed = new URL(base)
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:"
  const serverParam =
    serverId && serverId !== "local" ? `?server=${encodeURIComponent(serverId)}` : ""
  return `${wsScheme}//${parsed.host}/ws/operations/${encodeURIComponent(operationId)}${serverParam}`
}

/**
 * WebSocket URL for bench status updates.
 */
export function getBenchesWebSocketUrl(serverId?: string): string {
  const base =
    typeof api.defaults.baseURL === "string"
      ? api.defaults.baseURL
      : "http://localhost:8000"
  const parsed = new URL(base)
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:"
  const serverParam =
    serverId && serverId !== "local" ? `?server=${encodeURIComponent(serverId)}` : ""
  return `${wsScheme}//${parsed.host}/ws/benches${serverParam}`
}

/* ------------------------------------------------------------------ */
/*  Logs                                                               */
/* ------------------------------------------------------------------ */

export type LogFileInfo = {
  name: string
  size: number
  modified_at: number
}

export type LogTailResponse = {
  filename: string
  lines: string[]
  count: number
}

export async function getSiteLogFiles(
  benchName: string,
  siteName: string,
  serverId?: string,
): Promise<LogFileInfo[]> {
  const res = await api.get<LogFileInfo[]>(
    `/api/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/logs`,
    { params: withServer(serverId) },
  )
  return res.data
}

export async function getSiteLogTail(
  benchName: string,
  siteName: string,
  filename: string,
  tail = 500,
  serverId?: string,
): Promise<LogTailResponse> {
  const res = await api.get<LogTailResponse>(
    `/api/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/logs/${encodeURIComponent(filename)}`,
    { params: { tail, ...withServer(serverId) } },
  )
  return res.data
}

/**
 * WebSocket URL for live-tailing a log file.
 */
export function getLogTailWebSocketUrl(
  benchName: string,
  siteName: string,
  filename: string,
  serverId?: string,
): string {
  const base =
    typeof api.defaults.baseURL === "string"
      ? api.defaults.baseURL
      : "http://localhost:8000"
  const parsed = new URL(base)
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:"
  const serverParam =
    serverId && serverId !== "local" ? `?server=${encodeURIComponent(serverId)}` : ""
  return `${wsScheme}//${parsed.host}/ws/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/logs/${encodeURIComponent(filename)}${serverParam}`
}

/* ------------------------------------------------------------------ */
/*  Site Config                                                        */
/* ------------------------------------------------------------------ */

export type SiteConfigResponse = {
  editable: Record<string, unknown>
  readonly: Record<string, unknown>
}

export async function getSiteConfig(
  benchName: string,
  siteName: string,
  serverId?: string,
): Promise<SiteConfigResponse> {
  const res = await api.get<SiteConfigResponse>(
    `/api/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/config`,
    { params: withServer(serverId) },
  )
  return res.data
}

export async function updateSiteConfig(
  benchName: string,
  siteName: string,
  values: Record<string, unknown>,
  serverId?: string,
): Promise<SiteConfigResponse> {
  const res = await api.put<SiteConfigResponse>(
    `/api/benches/${encodeURIComponent(benchName)}/sites/${encodeURIComponent(siteName)}/config`,
    { values },
    { params: withServer(serverId) },
  )
  return res.data
}

/* ------------------------------------------------------------------ */
/*  Bench Update / Backup / Restore Operations                         */
/* ------------------------------------------------------------------ */

export type BenchUpdateBody = {
  bench_name: string
  reset: boolean
  no_backup: boolean
}

export async function postOperationBenchUpdate(
  body: BenchUpdateBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/bench-update",
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

export type SiteBackupBody = {
  bench_name: string
  site_name: string
  with_files: boolean
}

export async function postOperationSiteBackup(
  body: SiteBackupBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/site-backup",
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

export type SiteRestoreBody = {
  bench_name: string
  site_name: string
  backup_path: string
  db_root_password: string
}

export async function postOperationSiteRestore(
  body: SiteRestoreBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/site-restore",
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

/* ------------------------------------------------------------------ */
/*  System Check                                                       */
/* ------------------------------------------------------------------ */

export type SystemFixBody = {
  sudo_password: string
}

export async function getSystemCheckReport(
  serverId?: string,
): Promise<SystemCheckReport> {
  const res = await api.get<SystemCheckReport>("/api/system-check", {
    params: withServer(serverId),
  })
  return res.data
}

export async function postSystemFix(
  groupId: FixGroupId,
  body: SystemFixBody,
  serverId?: string,
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    `/api/system-check/fix/${encodeURIComponent(groupId)}`,
    body,
    { params: withServer(serverId) },
  )
  return res.data
}

export type FileEntryType = "file" | "directory"

export type FileEntry = {
  name: string
  type: FileEntryType
  size: number
  mtime: number
}

export type FileListResponse = {
  path: string
  entries: FileEntry[]
}

export async function getBenchFiles(
  benchName: string,
  path: string,
  serverId?: string,
): Promise<FileListResponse> {
  const res = await api.get<FileListResponse>(
    `/api/benches/${encodeURIComponent(benchName)}/files`,
    { params: { path, ...withServer(serverId) } },
  )
  return res.data
}
