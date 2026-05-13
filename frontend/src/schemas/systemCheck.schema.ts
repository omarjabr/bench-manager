import { z } from "zod"

export const systemFixSchema = z.object({
  sudoPassword: z.string().min(1, "Sudo password is required"),
})

export type SystemFixValues = z.infer<typeof systemFixSchema>
