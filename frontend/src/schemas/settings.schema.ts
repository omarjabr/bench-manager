import { z } from "zod"

/** Fallback MariaDB credentials when ``~/.my.cnf`` is absent. */
export const databaseConnectionSchema = z.object({
  db_host: z.string().min(1, "Host is required"),
  db_user: z.string().min(1, "User is required"),
  db_password: z.string(),
})

export type DatabaseConnectionFormValues = z.infer<
  typeof databaseConnectionSchema
>
