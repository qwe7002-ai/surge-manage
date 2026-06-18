import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SurgeAction } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

type Which = "effective" | "original";

export function ConfigPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
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
    if (connected) void load(which);
  }, [connected, which, load]);

  if (!connected) return <Disconnected />;

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
