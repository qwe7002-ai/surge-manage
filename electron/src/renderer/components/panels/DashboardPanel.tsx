import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleSlash,
  Gauge,
  Play,
  RefreshCw,
  RotateCw,
  Square,
} from "lucide-react";
import { formatBps } from "@surge-manage/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";
import { useInterval } from "@/hooks/use-interval";

export function DashboardPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const status = useApp((s) => s.status);
  const traffic = useApp((s) => s.traffic);
  const busy = useApp((s) => s.busy);
  const refreshStatus = useApp((s) => s.refreshStatus);
  const refreshTraffic = useApp((s) => s.refreshTraffic);
  const power = useApp((s) => s.power);

  // Live-poll traffic while connected and viewing the dashboard.
  useInterval(() => void refreshTraffic(), connected ? 3000 : null);

  if (!connected) {
    return <Disconnected hint="Select a host and press Connect to view live status." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Surge daemon
              {status?.running ? (
                <Badge variant="success">Running</Badge>
              ) : (
                <Badge variant="destructive">Stopped</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Stat label="Version" value={status?.version ?? "—"} />
            <Stat label="Outbound mode" value={status?.outboundMode ?? status?.mode ?? "—"} />
            <Stat label="Active policy" value={status?.activePolicy ?? "—"} />
            <Stat label="Uptime" value={formatUptime(status?.uptimeSeconds)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Gauge className="h-4 w-4" /> Throughput
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
              <span className="text-xl font-semibold tabular-nums">
                {formatBps(traffic?.downloadBps)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-sky-500" />
              <span className="text-xl font-semibold tabular-nums">
                {formatBps(traffic?.uploadBps)}
              </span>
            </div>
            <Stat
              label="Active connections"
              value={traffic?.connections != null ? String(traffic.connections) : "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Stat label="Downloaded" value={formatBytes(traffic?.downloadTotal)} />
            <Stat label="Uploaded" value={formatBytes(traffic?.uploadTotal)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Daemon control</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void power("start")}>
            <Play /> Start
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void power("reload")}
          >
            <RefreshCw /> Reload config
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void power("restart")}
          >
            <RotateCw /> Restart
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void power("stop")}
          >
            <Square /> Stop
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => void refreshStatus()}
          >
            <RefreshCw /> Refresh
          </Button>
        </CardContent>
      </Card>

      {status && !status.running && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleSlash className="h-3.5 w-3.5" />
          The surge daemon is not running on this host.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
