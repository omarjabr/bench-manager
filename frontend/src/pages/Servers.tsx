import { zodResolver } from "@hookform/resolvers/zod"
import {
  Add01Icon,
  Alert02Icon,
  CloudServerIcon,
  Delete01Icon,
  Link01Icon,
  Link02Icon,
  MoreVerticalIcon,
  PencilEdit01Icon,
  Upload02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useOperation } from "@/hooks/useOperation"
import {
  useConnectServer,
  useCreateServer,
  useDeleteServer,
  useDeployAgent,
  useDisconnectServer,
  useServers,
  useUpdateServer,
} from "@/hooks/useServers"
import type { ServerRecord, ServerStatus } from "@/lib/api"
import {
  serverCreateSchema,
  serverUpdateSchema,
  type ServerCreateValues,
  type ServerUpdateValues,
} from "@/schemas/server.schema"

function statusBadge(status: ServerStatus) {
  switch (status) {
    case "connected":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          Connected
        </Badge>
      )
    case "connecting":
      return (
        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
          Connecting
        </Badge>
      )
    case "error":
      return <Badge variant="destructive">Error</Badge>
    default:
      return <Badge variant="secondary">Disconnected</Badge>
  }
}

function AddServerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createServer = useCreateServer()

  const form = useForm<ServerCreateValues>({
    resolver: zodResolver(serverCreateSchema),
    defaultValues: {
      id: "",
      nickname: "",
      host: "",
      ssh_user: "",
      ssh_key_path: "",
      remote_agent_port: 8765,
    },
  })

  const onSubmit = (values: ServerCreateValues) => {
    createServer.mutate(values, {
      onSuccess: () => {
        form.reset()
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Server</DialogTitle>
          <DialogDescription>
            Register a new remote server to manage.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-id">Server ID</Label>
            <Input
              id="server-id"
              placeholder="production"
              {...form.register("id")}
            />
            {form.formState.errors.id && (
              <p className="text-xs text-destructive">
                {form.formState.errors.id.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-nickname">Nickname</Label>
            <Input
              id="server-nickname"
              placeholder="Production Server"
              {...form.register("nickname")}
            />
            {form.formState.errors.nickname && (
              <p className="text-xs text-destructive">
                {form.formState.errors.nickname.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-host">Host</Label>
            <Input
              id="server-host"
              placeholder="prod.example.com"
              {...form.register("host")}
            />
            {form.formState.errors.host && (
              <p className="text-xs text-destructive">
                {form.formState.errors.host.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server-ssh-user">SSH User</Label>
              <Input
                id="server-ssh-user"
                placeholder="frappe"
                {...form.register("ssh_user")}
              />
              {form.formState.errors.ssh_user && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ssh_user.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server-port">Agent Port</Label>
              <Input
                id="server-port"
                type="number"
                placeholder="8765"
                {...form.register("remote_agent_port")}
              />
              {form.formState.errors.remote_agent_port && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.remote_agent_port.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-key">SSH Key Path</Label>
            <Input
              id="server-key"
              placeholder="~/.ssh/id_rsa (optional)"
              {...form.register("ssh_key_path")}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createServer.isPending}>
              {createServer.isPending ? "Adding…" : "Add Server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditServerDialog({
  server,
  open,
  onOpenChange,
}: {
  server: ServerRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateMutation = useUpdateServer()

  const form = useForm<ServerUpdateValues>({
    resolver: zodResolver(serverUpdateSchema),
    defaultValues: {
      nickname: server.nickname,
      host: server.host,
      ssh_user: server.ssh_user,
      ssh_key_path: server.ssh_key_path,
      remote_agent_port: server.remote_agent_port,
    },
  })

  const onSubmit = (values: ServerUpdateValues) => {
    updateMutation.mutate(
      { serverId: server.id, body: values },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>
            Update connection settings for <strong>{server.nickname}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-nickname">Nickname</Label>
            <Input id="edit-nickname" {...form.register("nickname")} />
            {form.formState.errors.nickname && (
              <p className="text-xs text-destructive">
                {form.formState.errors.nickname.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-host">Host</Label>
            <Input id="edit-host" {...form.register("host")} />
            {form.formState.errors.host && (
              <p className="text-xs text-destructive">
                {form.formState.errors.host.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-ssh-user">SSH User</Label>
              <Input id="edit-ssh-user" {...form.register("ssh_user")} />
              {form.formState.errors.ssh_user && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ssh_user.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-port">Agent Port</Label>
              <Input
                id="edit-port"
                type="number"
                {...form.register("remote_agent_port")}
              />
              {form.formState.errors.remote_agent_port && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.remote_agent_port.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-key">SSH Key Path</Label>
            <Input id="edit-key" {...form.register("ssh_key_path")} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteServerDialog({
  server,
  open,
  onOpenChange,
}: {
  server: ServerRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const deleteMutation = useDeleteServer()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete server?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <strong>{server.nickname}</strong> (
            {server.host}) from the registry. Any active tunnel will be closed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteMutation.mutate(server.id, {
                onSuccess: () => onOpenChange(false),
              })
            }}
            className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ServerRow({ server }: { server: ServerRecord }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deployOpId, setDeployOpId] = useState<string | null>(null)
  const connectMutation = useConnectServer()
  const disconnectMutation = useDisconnectServer()
  const deployMutation = useDeployAgent()
  const queryClient = useQueryClient()

  const { status: opStatus } = useOperation(deployOpId)

  useEffect(() => {
    if (deployOpId && (opStatus === "done" || opStatus === "error")) {
      void queryClient.invalidateQueries({ queryKey: ["servers"] })
      setDeployOpId(null)
    }
  }, [deployOpId, opStatus, queryClient])

  const isLocal = server.id === "local"
  const isConnected = server.status === "connected"
  const isConnecting = server.status === "connecting"
  const isDeploying = deployMutation.isPending || deployOpId !== null
  const needsDeploy = !isLocal && !server.agent_deployed

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {server.nickname}
            {needsDeploy && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <HugeiconsIcon icon={Alert02Icon} className="size-3" />
                      Not deployed
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px]">
                    <p>Deploy the agent to this server before connecting.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {isLocal ? "localhost" : server.host}
        </TableCell>
        <TableCell>{statusBadge(server.status)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {isLocal ? "—" : server.ssh_user}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {isLocal ? "—" : server.remote_agent_port}
        </TableCell>
        <TableCell className="text-right">
          {!isLocal && (
            <div className="flex items-center justify-end gap-2">
              {needsDeploy ? (
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  disabled={isDeploying}
                  onClick={() =>
                    deployMutation.mutate(server.id, {
                      onSuccess: (data) => setDeployOpId(data.operation_id),
                    })
                  }
                >
                  <HugeiconsIcon icon={Upload02Icon} className="size-3.5" />
                  {isDeploying ? "Deploying…" : "Deploy Agent"}
                </Button>
              ) : isConnected ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={disconnectMutation.isPending}
                  onClick={() => disconnectMutation.mutate(server.id)}
                >
                  <HugeiconsIcon icon={Link02Icon} className="size-3.5" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  disabled={connectMutation.isPending || isConnecting}
                  onClick={() => connectMutation.mutate(server.id)}
                >
                  <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
                  {isConnecting ? "Connecting…" : "Connect"}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isConnected ? (
                    <DropdownMenuItem
                      onClick={() => disconnectMutation.mutate(server.id)}
                      disabled={disconnectMutation.isPending}
                    >
                      <HugeiconsIcon icon={Link02Icon} className="mr-2 size-4" />
                      Disconnect
                    </DropdownMenuItem>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="w-full">
                            <DropdownMenuItem
                              onClick={() => connectMutation.mutate(server.id)}
                              disabled={needsDeploy || connectMutation.isPending || isConnecting}
                            >
                              <HugeiconsIcon icon={Link01Icon} className="mr-2 size-4" />
                              Connect
                            </DropdownMenuItem>
                          </span>
                        </TooltipTrigger>
                        {needsDeploy && (
                          <TooltipContent side="left">
                            <p>Deploy the agent first</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      deployMutation.mutate(server.id, {
                        onSuccess: (data) => setDeployOpId(data.operation_id),
                      })
                    }
                    disabled={isDeploying || isConnected}
                  >
                    <HugeiconsIcon icon={Upload02Icon} className="mr-2 size-4" />
                    {isDeploying ? "Deploying…" : "Deploy Agent"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <HugeiconsIcon
                      icon={PencilEdit01Icon}
                      className="mr-2 size-4"
                    />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete01Icon} className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </TableCell>
      </TableRow>

      {!isLocal && (
        <>
          <EditServerDialog
            server={server}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <DeleteServerDialog
            server={server}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
        </>
      )}
    </>
  )
}

export default function Servers() {
  const { data: servers, isLoading, isError, error, refetch } = useServers()
  const [addOpen, setAddOpen] = useState(false)

  const hasUndeployedServers =
    servers?.some((s) => s.id !== "local" && !s.agent_deployed) ?? false

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold">Servers</h2>
          <p className="text-sm text-muted-foreground">
            Manage remote servers and SSH tunnel connections.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          <span className="hidden sm:inline">Add Server</span>
        </Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load servers."}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {hasUndeployedServers && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Agent deployment required</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              Before you can connect to a remote server, you need to deploy the
              Bench Manager agent to it. Click <strong>Deploy Agent</strong> on
              the server row, then <strong>Connect</strong> once deployment completes.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">Loading servers…</p>
        </div>
      ) : servers && servers.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SSH User</TableHead>
                <TableHead>Port</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <ServerRow key={server.id} server={server} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon
              icon={CloudServerIcon}
              className="size-6 text-muted-foreground"
            />
          </div>
          <div className="max-w-sm space-y-2">
            <p className="font-heading text-lg font-medium">
              No servers registered
            </p>
            <p className="text-sm text-muted-foreground">
              Add a remote server to manage Frappe benches across multiple
              machines.
            </p>
          </div>
        </div>
      )}

      <AddServerDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
