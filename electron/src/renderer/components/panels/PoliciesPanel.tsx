import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function PoliciesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const policies = useApp((s) => s.policies);
  const busy = useApp((s) => s.busy);
  const refreshPolicies = useApp((s) => s.refreshPolicies);
  const selectPolicy = useApp((s) => s.selectPolicy);

  useEffect(() => {
    if (connected) void refreshPolicies();
  }, [connected, refreshPolicies]);

  if (!connected) return <Disconnected />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Policy groups ({policies.length})
        </h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void refreshPolicies()}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>

      {policies.length === 0 && (
        <p className="text-sm text-muted-foreground">No selectable policy groups reported.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {policies.map((group) => (
          <Card key={group.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="truncate">{group.name}</span>
                <Badge variant="outline">{group.type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={group.selected ?? undefined}
                disabled={busy || group.members.length === 0}
                onValueChange={(member) => void selectPolicy(group.name, member)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select policy…" />
                </SelectTrigger>
                <SelectContent>
                  {group.members.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
