import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function ConfigPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([
        window.surge.surge.run("configPath"),
        window.surge.surge.run("configShow"),
      ]);
      setPath(p.stdout.trim());
      setContent(c.stdout);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!connected) return <Disconnected />;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        {path && <Badge variant="outline" className="font-mono text-[10px]">{path}</Badge>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-xs leading-relaxed">
        {content || (loading ? "Loading…" : "No configuration returned.")}
      </pre>
    </div>
  );
}
