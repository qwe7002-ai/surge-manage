import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function RulesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const rules = useApp((s) => s.rules);
  const tempRules = useApp((s) => s.tempRules);
  const busy = useApp((s) => s.busy);
  const refreshRules = useApp((s) => s.refreshRules);
  const refreshTempRules = useApp((s) => s.refreshTempRules);
  const addTempRule = useApp((s) => s.addTempRule);
  const delTempRule = useApp((s) => s.delTempRule);
  const flushTempRules = useApp((s) => s.flushTempRules);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (connected) {
      void refreshRules();
      void refreshTempRules();
    }
  }, [connected, refreshRules, refreshTempRules]);

  function submitTempRule() {
    const r = draft.trim();
    if (!r) return;
    void addTempRule(r);
    setDraft("");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.type.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.policy.toLowerCase().includes(q),
    );
  }, [rules, query]);

  if (!connected) return <Disconnected />;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="rounded-md border p-2.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Temporary rules
          </span>
          <Badge variant="secondary">{tempRules.length}</Badge>
          {tempRules.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-destructive"
              disabled={busy}
              onClick={() => void flushTempRules()}
            >
              <Trash2 /> Flush all
            </Button>
          )}
        </div>
        <div className="mb-2 flex gap-1.5">
          <Input
            value={draft}
            placeholder="DOMAIN-SUFFIX,example.com,Proxy"
            className="h-8 font-mono text-xs"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitTempRule()}
          />
          <Button size="sm" className="h-8" disabled={busy} onClick={submitTempRule}>
            <Plus /> Add
          </Button>
        </div>
        {tempRules.length > 0 && (
          <div className="max-h-28 space-y-1 overflow-auto">
            {tempRules.map((r) => (
              <div
                key={r}
                className="flex items-center gap-2 rounded bg-accent/40 px-2 py-1"
              >
                <code className="flex-1 truncate text-xs">{r}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  disabled={busy}
                  onClick={() => void delTempRule(r)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Filter rules…"
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Badge variant="secondary">{filtered.length}</Badge>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void refreshRules()}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Policy</th>
              <th className="px-3 py-2 text-right font-medium">Hits</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-3 py-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {r.type}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.value || "—"}</td>
                <td className="px-3 py-1.5">{r.policy}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.hits ?? "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No rules match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
