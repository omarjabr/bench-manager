import { z } from "zod"

/**
 * Schema for the "Add / Edit Server" form.
 * The ``id`` field is only required on creation (slug used as the primary key).
 */
export const serverCreateSchema = z.object({
  id: z
    .string()
    .min(1, "Server ID is required")
    .max(64, "Server ID must be 64 characters or fewer")
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "Must start with a letter or digit and contain only lowercase letters, digits, and hyphens",
    ),
  nickname: z
    .string()
    .min(1, "Nickname is required")
    .max(128, "Nickname must be 128 characters or fewer"),
  host: z.string().min(1, "Host is required"),
  ssh_user: z.string().min(1, "SSH user is required"),
  ssh_key_path: z.string().default(""),
  remote_agent_port: z.coerce
    .number()
    .int()
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535")
    .default(8765),
})

export type ServerCreateValues = z.infer<typeof serverCreateSchema>

export const serverUpdateSchema = z.object({
  nickname: z
    .string()
    .min(1, "Nickname is required")
    .max(128, "Nickname must be 128 characters or fewer"),
  host: z.string().min(1, "Host is required"),
  ssh_user: z.string().min(1, "SSH user is required"),
  ssh_key_path: z.string().default(""),
  remote_agent_port: z.coerce
    .number()
    .int()
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535")
    .default(8765),
})

export type ServerUpdateValues = z.infer<typeof serverUpdateSchema>
