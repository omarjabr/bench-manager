import { z } from "zod"

const limitsSchema = z.object({
  space_usage: z.coerce.number().optional(),
  emails: z.coerce.number().optional(),
  users: z.coerce.number().optional(),
})

export const siteConfigSchema = z.object({
  developer_mode: z.coerce.number().min(0).max(1).optional(),
  maintenance_mode: z.coerce.number().min(0).max(1).optional(),
  allow_tests: z.coerce.number().min(0).max(1).optional(),
  server_script_enabled: z.coerce.number().min(0).max(1).optional(),
  host_name: z.string().optional(),
  encryption_key: z.string().optional(),
  mail_server: z.string().optional(),
  mail_port: z.coerce.number().optional(),
  mail_login: z.string().optional(),
  mail_password: z.string().optional(),
  use_tls: z.coerce.number().min(0).max(1).optional(),
  auto_email_id: z.string().optional(),
  scheduler_enabled: z.coerce.number().min(0).max(1).optional(),
  pause_scheduler: z.coerce.number().min(0).max(1).optional(),
  allow_cors: z.string().optional(),
  ignore_csrf: z.boolean().optional(),
  limits: limitsSchema.optional(),
})

export type SiteConfigFormValues = z.infer<typeof siteConfigSchema>
