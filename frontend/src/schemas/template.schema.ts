import { z } from "zod"

const templateAppEntrySchema = z.object({
  name: z.string().min(1),
  repo_url: z.string().min(1),
  branch: z.string().optional(),
})

export const templateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  frappeVersion: z.enum(["version-15", "version-14", "develop"]),
  selectedApps: z.array(templateAppEntrySchema).default([]),
})

export type TemplateFormValues = z.infer<typeof templateFormSchema>
