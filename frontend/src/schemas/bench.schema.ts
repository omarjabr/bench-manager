import { z } from "zod"

/** Curated default apps (see PRD §12). */
export const DEFAULT_APP_REGISTRY: { name: string; repo_url: string }[] = [
  { name: "ERPNext", repo_url: "https://github.com/frappe/erpnext" },
  { name: "HRMS", repo_url: "https://github.com/frappe/hrms" },
  { name: "Payments", repo_url: "https://github.com/frappe/payments" },
  { name: "LMS", repo_url: "https://github.com/frappe/lms" },
  { name: "Helpdesk", repo_url: "https://github.com/frappe/helpdesk" },
  { name: "CRM", repo_url: "https://github.com/frappe/crm" },
  { name: "Insights", repo_url: "https://github.com/frappe/insights" },
  { name: "Print Designer", repo_url: "https://github.com/frappe/print_designer" },
  { name: "Builder", repo_url: "https://github.com/frappe/builder" },
  { name: "WhatsApp", repo_url: "https://github.com/frappe/frappe_whatsapp" },
]

const benchNameRegex = /^[a-zA-Z0-9_-]+$/

export const newBenchWizardStep1Schema = z.object({
  benchName: z
    .string()
    .min(1, "Bench name is required")
    .regex(benchNameRegex, "Use letters, digits, underscores, or hyphens only"),
  parentDir: z.string().min(1, "Parent directory is required"),
  frappeVersion: z.enum(["version-15", "version-14", "develop"]),
})

export const customRepoUrlSchema = z
  .string()
  .min(1, "URL is required")
  .refine((value) => value.startsWith("https://"), {
    message: "Repository URL must start with https://",
  })

const siteNameRule = z
  .string()
  .min(1, "Site name is required")
  .refine((value) => value === value.toLowerCase() && !value.includes(" "), {
    message: "Use lowercase letters and no spaces",
  })
  .refine((value) => value.includes("."), {
    message: "Use a dotted name (e.g. mysite.localhost)",
  })

/** Wizard step 2 — site credentials (DB root password may be empty for local MariaDB). */
export const newBenchWizardSiteStepSchema = z.object({
  siteName: siteNameRule,
  adminPassword: z.string().min(8, "Use at least 8 characters"),
  dbRootPassword: z.string(),
})

export const newBenchWizardAppsStepSchema = z.object({
  selectedApps: z
    .array(
      z.object({
        name: z.string().min(1),
        repo_url: z.string().min(1),
        branch: z.string().optional(),
      })
    )
    .default([]),
})

/** Full wizard form (steps 1–2 fields; step 3 apps stay in separate state). */
export const newBenchWizardFullFormSchema = z.object({
  benchName: newBenchWizardStep1Schema.shape.benchName,
  parentDir: newBenchWizardStep1Schema.shape.parentDir,
  frappeVersion: newBenchWizardStep1Schema.shape.frappeVersion,
  siteName: newBenchWizardSiteStepSchema.shape.siteName,
  adminPassword: newBenchWizardSiteStepSchema.shape.adminPassword,
  dbRootPassword: newBenchWizardSiteStepSchema.shape.dbRootPassword,
})

export type NewBenchWizardFullFormValues = z.infer<typeof newBenchWizardFullFormSchema>

export const getAppRepoUrlSchema = z
  .string()
  .min(1, "Repository URL is required")
  .refine((value) => value.startsWith("https://"), {
    message: "Repository URL must start with https://",
  })

/** Get App dialog: repo URL plus optional branch (passed to ``bench get-app --branch``). */
export const getAppDialogFormSchema = z.object({
  repoUrl: getAppRepoUrlSchema,
  branch: z.string().optional(),
})

export type GetAppDialogFormValues = z.infer<typeof getAppDialogFormSchema>

/**
 * Available license options for new Frappe apps.
 * Matches the choices offered by `bench new-app`.
 */
export const APP_LICENSE_OPTIONS = [
  "agpl-3.0",
  "apache-2.0",
  "bsd-2-clause",
  "bsd-3-clause",
  "bsl-1.0",
  "cc0-1.0",
  "epl-2.0",
  "gpl-2.0",
  "gpl-3.0",
  "lgpl-2.1",
  "mit",
  "mpl-2.0",
  "unlicense",
] as const

export type AppLicense = (typeof APP_LICENSE_OPTIONS)[number]

/**
 * Regex for validating Frappe app names.
 * Must be lowercase, start with a letter, and contain only letters, digits, and underscores.
 */
const appNameRegex = /^[a-z][a-z0-9_]*$/

/**
 * Schema for the New App dialog form fields.
 * Used to create a new Frappe app via `bench new-app`.
 */
export const newAppDialogFormSchema = z.object({
  appName: z
    .string()
    .min(1, "App name is required")
    .regex(
      appNameRegex,
      "Must start with a lowercase letter and contain only lowercase letters, digits, or underscores"
    ),
  appTitle: z.string().min(1, "App title is required"),
  appDescription: z.string().default(""),
  appPublisher: z.string().min(1, "Publisher is required"),
  appEmail: z.string().email("Must be a valid email address"),
  appLicense: z.enum(APP_LICENSE_OPTIONS).default("mit"),
  createGithubWorkflow: z.boolean().default(false),
})

export type NewAppDialogFormValues = z.infer<typeof newAppDialogFormSchema>

/**
 * Available framework options for doppio SPA.
 */
export const SPA_FRAMEWORK_OPTIONS = ["vue", "react"] as const

export type SpaFramework = (typeof SPA_FRAMEWORK_OPTIONS)[number]

/**
 * Regex for validating SPA dashboard names.
 * Must be lowercase, start with a letter, and contain only letters, digits, and underscores.
 */
const spaNameRegex = /^[a-z][a-z0-9_]*$/

/**
 * Schema for the Add SPA dialog form fields.
 * Used to create a new SPA via `bench add-spa`.
 */
export const addSpaDialogFormSchema = z.object({
  spaName: z
    .string()
    .min(1, "SPA name is required")
    .regex(
      spaNameRegex,
      "Must start with a lowercase letter and contain only lowercase letters, digits, or underscores"
    ),
  appName: z.string().min(1, "App name is required"),
  framework: z.enum(SPA_FRAMEWORK_OPTIONS).default("vue"),
  useTailwind: z.boolean().default(false),
  useTypescript: z.boolean().default(true),
})

export type AddSpaDialogFormValues = z.infer<typeof addSpaDialogFormSchema>
