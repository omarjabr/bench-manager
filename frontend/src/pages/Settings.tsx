import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useLocation } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSettings } from "@/hooks/useSettings"
import { getApiErrorMessage, updateSettings } from "@/lib/api"
import {
  databaseConnectionSchema,
  type DatabaseConnectionFormValues,
} from "@/schemas/settings.schema"

export default function Settings() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const { data: settings, isLoading } = useSettings()

  const form = useForm<DatabaseConnectionFormValues>({
    resolver: zodResolver(databaseConnectionSchema),
    defaultValues: {
      db_host: "127.0.0.1",
      db_user: "root",
      db_password: "",
    },
  })

  useEffect(() => {
    if (settings) {
      form.reset({
        db_host: settings.db_host,
        db_user: settings.db_user,
        db_password: settings.db_password,
      })
    }
  }, [settings, form])

  useEffect(() => {
    if (location.hash === "#database-connection") {
      document
        .getElementById("database-connection")
        ?.scrollIntoView({ behavior: "smooth" })
    }
  }, [location.hash])

  const mutation = useMutation({
    mutationFn: (values: DatabaseConnectionFormValues) =>
      updateSettings(values),
    onSuccess: () => {
      toast.success("Settings saved")
      void queryClient.invalidateQueries({ queryKey: ["settings"] })
      void queryClient.invalidateQueries({ queryKey: ["database", "status"] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <h2 className="font-heading text-xl font-semibold">Settings</h2>
      <Card id="database-connection">
        <CardHeader>
          <CardTitle>Database Connection</CardTitle>
          <CardDescription>
            Used as fallback when ~/.my.cnf is not present.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="db_host">DB Host</Label>
              <Input
                id="db_host"
                autoComplete="off"
                {...form.register("db_host")}
              />
              {form.formState.errors.db_host && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.db_host.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="db_user">DB User</Label>
              <Input
                id="db_user"
                autoComplete="username"
                {...form.register("db_user")}
              />
              {form.formState.errors.db_user && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.db_user.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="db_password">DB Password</Label>
              <Input
                id="db_password"
                type="password"
                autoComplete="current-password"
                {...form.register("db_password")}
              />
              {form.formState.errors.db_password && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.db_password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={mutation.isPending || isLoading}
            >
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
