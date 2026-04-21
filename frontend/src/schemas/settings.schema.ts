import { z } from "zod"

/** Bench discovery settings card. */
export const discoverySettingsSchema = z.object({
  root_scan_dir: z
    .string()
    .min(1, "Scan directory is required")
    .refine((v) => v.startsWith("/") || v.startsWith("~"), {
      message: "Path must start with / or ~",
    }),
  excluded_paths: z.array(z.string()),
  scan_interval_seconds: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be an integer")
    .min(10, "Minimum is 10 seconds")
    .max(3600, "Maximum is 3600 seconds"),
})

export type DiscoverySettingsFormValues = z.infer<typeof discoverySettingsSchema>

/** Single entry in the common app registry. */
export const appRegistryItemSchema = z.object({
  name: z.string().min(1, "App name is required"),
  repo_url: z
    .string()
    .min(1, "Repository URL is required")
    .refine((v) => v.startsWith("https://"), {
      message: "URL must start with https://",
    }),
  default_branch: z.string().min(1, "Branch is required"),
})

export type AppRegistryItemFormValues = z.infer<typeof appRegistryItemSchema>

/** Fallback MariaDB credentials when ``~/.my.cnf`` is absent. */
export const databaseConnectionSchema = z.object({
  db_host: z.string().min(1, "Host is required"),
  db_user: z.string().min(1, "User is required"),
  db_password: z.string(),
})

export type DatabaseConnectionFormValues = z.infer<
  typeof databaseConnectionSchema
>
