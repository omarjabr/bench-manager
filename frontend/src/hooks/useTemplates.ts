import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createTemplate,
  deleteTemplate,
  getTemplates,
  updateTemplate,
  useTemplate,
  type TemplateCreate,
} from "@/lib/api"

const TEMPLATES_KEY = ["templates"] as const

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: getTemplates,
    staleTime: 30_000,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TemplateCreate) => createTemplate(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateCreate }) =>
      updateTemplate(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useUseTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => useTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}
