import { useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";
import { useInterval } from "@/hooks/use-interval";

export function ConnectionsPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const connections = useApp((s) => s.connections);
  const busy = useApp((s) => s.busy);
  const refreshTraffic = useApp((s) => s.refreshTraffic);
  const killConnection = useApp((s) => s.killConnection);

  useEffect(() => {
    if (connected) void refreshTraffic();
  }, [connected, refreshTraffic]);
  useInterval(() => void refreshTraffic(), connected ? 3000 : null);

  if (!connected) return <Disconnected />;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{connections.length} active</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={busy}
          onClick={() => void refreshTraffic()}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Remote</th>
              <th className="px-3 py-2 font-medium">Policy</th>
              <th className="px-3 py-2 text-right font-medium">↓</th>
              <th className="px-3 py-2 text-right font-medium">↑</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-3 py-1.5 font-mono text-xs">{c.remote}</td>
                <td className="px-3 py-1.5">{c.policy ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {bytes(c.downloadBytes)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {bytes(c.uploadBytes)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    disabled={busy}
                    title="Kill connection"
                    onClick={() => void killConnection(c.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No active connections.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function bytes(n?: number): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
