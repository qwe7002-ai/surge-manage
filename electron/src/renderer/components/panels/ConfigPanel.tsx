import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SurgeAction } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disconnected } from "@/components/Disconnected";
import { SectionEditor } from "@/components/SectionEditor";
import { useApp } from "@/store/app-store";

type Which = "effective" | "original";

export function ConfigPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const refreshProfiles = useApp((s) => s.refreshProfiles);

  useEffect(() => {
    if (connected) void refreshProfiles();
  }, [connected, refreshProfiles]);

  if (!connected) return <Disconnected />;

  return (
    <Tabs defaultValue="proxies" className="flex h-full flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="proxies">Proxies</TabsTrigger>
        <TabsTrigger value="raw">Raw config</TabsTrigger>
      </TabsList>
      <TabsContent value="proxies" className="min-h-0 flex-1">
        <SectionEditor
          section="Proxy"
          placeholder="MyNode = vmess, server.com, 443, username=uuid, …"
          hint="Edits the [Proxy] section of the selected profile, then reloads Surge."
        />
      </TabsContent>
      <TabsContent value="raw" className="min-h-0 flex-1">
        <RawConfig />
      </TabsContent>
    </Tabs>
  );
}

/** Read-only viewer of the resolved/original profile. */
function RawConfig() {
  const [which, setWhich] = useState<Which>("effective");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (w: Which) => {
    setLoading(true);
    setError(null);
    try {
      const action: SurgeAction =
        w === "effective" ? "dumpProfileEffective" : "dumpProfileOriginal";
      const r = await window.surge.surge.run(action);
      setContent(r.stdout);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(which);
  }, [which, load]);

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        <Tabs value={which} onValueChange={(v) => setWhich(v as Which)}>
          <TabsList>
            <TabsTrigger value="effective">Effective</TabsTrigger>
            <TabsTrigger value="original">Original</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={loading}
          onClick={() => void load(which)}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-xs leading-relaxed">
        {content || (loading ? "Loading…" : "No profile returned.")}
      </pre>
    </div>
  );
}
