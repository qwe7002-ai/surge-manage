import { useEffect } from "react";
import {
  Activity,
  FileText,
  ListTree,
  Network,
  Package,
  Plug,
  ScrollText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { DashboardPanel } from "@/components/panels/DashboardPanel";
import { PoliciesPanel } from "@/components/panels/PoliciesPanel";
import { RulesPanel } from "@/components/panels/RulesPanel";
import { ConnectionsPanel } from "@/components/panels/ConnectionsPanel";
import { ResourcesPanel } from "@/components/panels/ResourcesPanel";
import { LogsPanel } from "@/components/panels/LogsPanel";
import { ConfigPanel } from "@/components/panels/ConfigPanel";
import { useApp } from "@/store/app-store";

export default function App() {
  const init = useApp((s) => s.init);
  const connected = useApp((s) => s.connection.phase === "connected");

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen flex-col bg-background text-foreground">
        <header className="titlebar-drag flex h-11 shrink-0 items-center border-b py-0 pl-24 pr-4">
          <Network className="mr-2 h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold tracking-tight">Surge Manage</span>
          <span className="ml-2 text-xs text-muted-foreground">
            remote control over SSH
          </span>
        </header>

        <div className="flex min-h-0 flex-1">
          <Sidebar />

          <main className="flex min-w-0 flex-1 flex-col">
            <Tabs defaultValue="dashboard" className="flex min-h-0 flex-1 flex-col">
              <div className="border-b px-4 pt-3">
                <TabsList>
                  <TabsTrigger value="dashboard">
                    <Activity /> Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="policies" disabled={!connected}>
                    <Network /> Policies
                  </TabsTrigger>
                  <TabsTrigger value="rules" disabled={!connected}>
                    <ListTree /> Rules
                  </TabsTrigger>
                  <TabsTrigger value="connections" disabled={!connected}>
                    <Plug /> Connections
                  </TabsTrigger>
                  <TabsTrigger value="logs" disabled={!connected}>
                    <ScrollText /> Requests
                  </TabsTrigger>
                  <TabsTrigger value="resources" disabled={!connected}>
                    <Package /> Resources
                  </TabsTrigger>
                  <TabsTrigger value="config" disabled={!connected}>
                    <FileText /> Config
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                <TabsContent value="dashboard" className="mt-0">
                  <DashboardPanel />
                </TabsContent>
                <TabsContent value="policies" className="mt-0">
                  <PoliciesPanel />
                </TabsContent>
                <TabsContent value="rules" className="mt-0">
                  <RulesPanel />
                </TabsContent>
                <TabsContent value="connections" className="mt-0 h-full">
                  <ConnectionsPanel />
                </TabsContent>
                <TabsContent value="logs" className="mt-0 h-full">
                  <LogsPanel />
                </TabsContent>
                <TabsContent value="resources" className="mt-0 h-full">
                  <ResourcesPanel />
                </TabsContent>
                <TabsContent value="config" className="mt-0">
                  <ConfigPanel />
                </TabsContent>
              </div>
            </Tabs>

            <StatusBar />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
