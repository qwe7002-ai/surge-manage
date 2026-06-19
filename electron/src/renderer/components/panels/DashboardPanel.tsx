import {
  Activity,
  RefreshCw,
  RotateCw,
  Square,
  Stethoscope,
  Waves,
  Wind,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEATURE_TOGGLES, isToggleOn } from "@surge-manage/shared";
import { Switch } from "@/components/ui/switch";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";
import { useInterval } from "@/hooks/use-interval";

const LOG_LEVELS = ["verbose", "info", "notify", "warning"];

export function DashboardPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const environment = useApp((s) => s.environment);
  const traffic = useApp((s) => s.traffic);
  const busy = useApp((s) => s.busy);
  const lastInfo = useApp((s) => s.lastInfo);
  const profiles = useApp((s) => s.profiles);
  const refreshEnvironment = useApp((s) => s.refreshEnvironment);
  const refreshTraffic = useApp((s) => s.refreshTraffic);
  const runAction = useApp((s) => s.runAction);
  const setToggle = useApp((s) => s.setToggle);
  const switchProfile = useApp((s) => s.switchProfile);
  const refreshProfiles = useApp((s) => s.refreshProfiles);

  // Live-poll active connections while connected and viewing the dashboard.
  useInterval(() => void refreshTraffic(), connected ? 3000 : null);

  if (!connected) {
    return <Disconnected hint="Select a host and press Connect to view live state." />;
  }

  const envEntries = Object.entries(environment?.fields ?? {});

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Environment
              <Button
                size="sm"
                variant="ghost"
                className="h-6"
                disabled={busy}
                onClick={() => void refreshEnvironment()}
              >
                <RefreshCw />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2">
            {envEntries.length === 0 && (
              <span className="text-sm text-muted-foreground">No data.</span>
            )}
            {envEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-muted-foreground">{k}</span>
                <span className="truncate font-medium">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4" /> Connections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-semibold tabular-nums">
              {traffic?.connections ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">active connections</p>
            <Stat label="Down (session)" value={formatBytes(traffic?.downloadTotal)} />
            <Stat label="Up (session)" value={formatBytes(traffic?.uploadTotal)} />
          </CardContent>
        </Card>
      </div>

      {profiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              Profiles
              <Button
                size="sm"
                variant="ghost"
                className="h-6"
                disabled={busy}
                onClick={() => void refreshProfiles()}
              >
                <RefreshCw />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <Button
                key={p}
                size="sm"
                variant="outline"
                disabled={busy}
                title="Switch to this profile"
                onClick={() => void switchProfile(p)}
              >
                {p}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Features</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-3">
          {FEATURE_TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm">
              <Switch
                checked={isToggleOn(environment?.fields[t.key])}
                disabled={busy}
                onCheckedChange={(on) => void setToggle(t.key, on)}
              />
              {t.label}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Control</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void runAction("reload")}>
            <RotateCw /> Reload profile
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void runAction("flushDns")}
          >
            <Wind /> Flush DNS
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void runAction("testNetwork")}
          >
            <Waves /> Test network
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void runAction("diagnostics")}
          >
            <Stethoscope /> Diagnostics
          </Button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Log level</span>
            <Select onValueChange={(v) => void runAction("setLogLevel", [v])}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="set…" />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="destructive"
            className="ml-auto"
            disabled={busy}
            onClick={() => void runAction("stop")}
          >
            <Square /> Stop Surge
          </Button>
        </CardContent>
      </Card>

      {lastInfo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/30 p-2 font-mono text-xs">
              {lastInfo}
            </pre>
          </CardContent>
        </Card>
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
