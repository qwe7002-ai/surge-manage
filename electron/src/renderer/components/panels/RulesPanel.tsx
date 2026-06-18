import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

export function RulesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const refreshRules = useApp((s) => s.refreshRules);
  const refreshTempRules = useApp((s) => s.refreshTempRules);

  useEffect(() => {
    if (connected) {
      void refreshRules();
      void refreshTempRules();
    }
  }, [connected, refreshRules, refreshTempRules]);

  if (!connected) return <Disconnected />;

  return (
    <Tabs defaultValue="permanent" className="flex h-full flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="permanent">Permanent</TabsTrigger>
        <TabsTrigger value="temporary">Temporary</TabsTrigger>
      </TabsList>
      <TabsContent value="permanent" className="min-h-0 flex-1">
        <PermanentRules />
      </TabsContent>
      <TabsContent value="temporary" className="min-h-0 flex-1">
        <TemporaryRules />
      </TabsContent>
    </Tabs>
  );
}

/** Read-only rules from the active profile (`dump rule`). */
function PermanentRules() {
  const rules = useApp((s) => s.rules);
  const busy = useApp((s) => s.busy);
  const refreshRules = useApp((s) => s.refreshRules);
  const [query, setQuery] = useState("");

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

  return (
    <div className="flex h-full flex-col space-y-3">
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
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refreshRules()}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Profile rules are read-only here. To change them, edit the profile config;
        use Temporary rules for live, ad-hoc overrides.
      </p>

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

/** Editable temporary rules (`add-/update-/del-/flush-temp-rule`). */
function TemporaryRules() {
  const tempRules = useApp((s) => s.tempRules);
  const busy = useApp((s) => s.busy);
  const refreshTempRules = useApp((s) => s.refreshTempRules);
  const addTempRule = useApp((s) => s.addTempRule);
  const delTempRule = useApp((s) => s.delTempRule);
  const updateTempRule = useApp((s) => s.updateTempRule);
  const flushTempRules = useApp((s) => s.flushTempRules);
  const [draft, setDraft] = useState("");

  function submit() {
    const r = draft.trim();
    if (!r) return;
    void addTempRule(r);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{tempRules.length}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={busy}
          onClick={() => void refreshTempRules()}
        >
          <RefreshCw /> Refresh
        </Button>
        {tempRules.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive"
            disabled={busy}
            onClick={() => void flushTempRules()}
          >
            <Trash2 /> Flush all
          </Button>
        )}
      </div>

      <div className="flex gap-1.5">
        <Input
          value={draft}
          placeholder="DOMAIN-SUFFIX,example.com,Proxy"
          className="h-8 font-mono text-xs"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Button size="sm" className="h-8" disabled={busy} onClick={submit}>
          <Plus /> Add
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {tempRules.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            No temporary rules.
          </p>
        )}
        {tempRules.map((r) => (
          <TempRuleRow
            key={r}
            rule={r}
            busy={busy}
            onSave={(next) => next !== r && void updateTempRule(r, next)}
            onDelete={() => void delTempRule(r)}
          />
        ))}
      </div>
    </div>
  );
}

function TempRuleRow({
  rule,
  busy,
  onSave,
  onDelete,
}: {
  rule: string;
  busy: boolean;
  onSave: (next: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rule);

  function commit() {
    const next = value.trim();
    if (next) onSave(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded bg-accent/40 px-2 py-1">
        <Input
          autoFocus
          value={value}
          className="h-7 flex-1 font-mono text-xs"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(rule);
              setEditing(false);
            }
          }}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={commit}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => {
            setValue(rule);
            setEditing(false);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded bg-accent/40 px-2 py-1">
      <code className="flex-1 truncate text-xs">{rule}</code>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        disabled={busy}
        title="Edit rule"
        onClick={() => {
          setValue(rule);
          setEditing(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-destructive"
        disabled={busy}
        title="Delete rule"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
