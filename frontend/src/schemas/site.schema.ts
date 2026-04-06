import { z } from "zod"

export const newSiteOperationSchema = z.object({
  siteName: z
    .string()
    .min(1, "Site name is required")
    .refine((value) => value === value.toLowerCase() && !value.includes(" "), {
      message: "Use lowercase letters and no spaces",
    })
    .refine(
      (value) => value.endsWith(".localhost") || value.includes("."),
      {
        message:
          "Use a dotted name (e.g. site.localhost or site.local)",
      }
    ),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  dbRootPassword: z.string().min(8, "Password must be at least 8 characters"),
  apps: z.array(z.string()),
})

export type NewSiteOperationFormValues = z.infer<typeof newSiteOperationSchema>

const appNameToken = z
  .string()
  .min(1)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "App name may only contain letters, digits, underscores, or hyphens"
  )

export const installAppsOnSiteSchema = z.object({
  apps: z.array(appNameToken).min(1, "Select at least one app"),
})

export type InstallAppsOnSiteFormValues = z.infer<typeof installAppsOnSiteSchema>
