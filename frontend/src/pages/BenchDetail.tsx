import { useParams } from "react-router-dom"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function BenchDetail() {
  const { name } = useParams()

  const benchName =
    name !== undefined && name.length > 0 ? name : "Unknown bench"

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-heading text-xl font-semibold">{benchName}</h2>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="apps">Apps</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="min-h-[120px]" />
        </TabsContent>
        <TabsContent value="sites">
          <div className="min-h-[120px]" />
        </TabsContent>
        <TabsContent value="apps">
          <div className="min-h-[120px]" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
