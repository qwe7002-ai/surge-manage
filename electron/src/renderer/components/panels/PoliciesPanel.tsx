import { useEffect } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import type { PolicyTest } from "@surge-manage/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function PoliciesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const policies = useApp((s) => s.policies);
  const policyTests = useApp((s) => s.policyTests);
  const busy = useApp((s) => s.busy);
  const refreshPolicies = useApp((s) => s.refreshPolicies);
  const testAllPolicies = useApp((s) => s.testAllPolicies);
  const testGroup = useApp((s) => s.testGroup);

  useEffect(() => {
    if (connected) void refreshPolicies();
  }, [connected, refreshPolicies]);

  if (!connected) return <Disconnected />;

  const proxies = policies?.proxies ?? [];
  const groups = policies?.groups ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {groups.length} groups · {proxies.length} proxies
        </h2>
        <div className="flex gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => void testAllPolicies()}>
            <Gauge /> Test all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void refreshPolicies()}
          >
            <RefreshCw /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Policy groups</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {groups.length === 0 && (
            <span className="text-sm text-muted-foreground">No policy groups.</span>
          )}
          {groups.map((g) => (
            <Button
              key={g}
              size="sm"
              variant="outline"
              disabled={busy}
              title="Retest this group"
              onClick={() => void testGroup(g)}
            >
              {g}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Proxies</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {proxies.map((p) => (
            <ProxyRow key={p} name={p} test={policyTests[p]} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ProxyRow({ name, test }: { name: string; test?: PolicyTest }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
      <span className="truncate">{name}</span>
      <Latency test={test} />
    </div>
  );
}

function Latency({ test }: { test?: PolicyTest }) {
  if (!test) return <span className="text-xs text-muted-foreground">—</span>;
  if (test.error) {
    return (
      <Badge variant="destructive" className="text-[10px]" title={test.error}>
        failed
      </Badge>
    );
  }
  const ms = test.receiveMs ?? test.tcpMs;
  if (ms == null) return <span className="text-xs text-muted-foreground">—</span>;
  const variant = ms < 300 ? "success" : ms < 800 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="text-[10px] tabular-nums">
      {ms} ms
    </Badge>
  );
}
