import { useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function ResourcesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const resources = useApp((s) => s.resources);
  const busy = useApp((s) => s.busy);
  const refreshResources = useApp((s) => s.refreshResources);
  const updateResource = useApp((s) => s.updateResource);
  const updateAllResources = useApp((s) => s.updateAllResources);

  useEffect(() => {
    if (connected) void refreshResources();
  }, [connected, refreshResources]);

  if (!connected) return <Disconnected />;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          External resources
        </span>
        <Badge variant="secondary">{resources.length}</Badge>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            disabled={busy || resources.length === 0}
            onClick={() => void updateAllResources()}
          >
            <Download /> Update all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void refreshResources()}
          >
            <RefreshCw /> Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Resource</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.key} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-3 py-1.5">
                  <div className="truncate font-mono text-xs" title={r.url ?? r.key}>
                    {r.url ?? r.key}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-1.5">
                  {r.ready === false ? (
                    <Badge variant="secondary">pending</Badge>
                  ) : (
                    <Badge variant="success">ready</Badge>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={busy}
                    onClick={() => void updateResource(r.key)}
                  >
                    Update
                  </Button>
                </td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No external resources.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
