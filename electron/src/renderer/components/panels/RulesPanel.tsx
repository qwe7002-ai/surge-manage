import { useEffect, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disconnected } from "@/components/Disconnected";
import { RuleEditor } from "@/components/RuleEditor";
import { useApp } from "@/store/app-store";

export function RulesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const refreshTempRules = useApp((s) => s.refreshTempRules);
  const refreshProfiles = useApp((s) => s.refreshProfiles);

  useEffect(() => {
    if (connected) {
      void refreshTempRules();
      void refreshProfiles();
    }
  }, [connected, refreshTempRules, refreshProfiles]);

  if (!connected) return <Disconnected />;

  return (
    <Tabs defaultValue="permanent" className="flex h-full flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="permanent">Permanent</TabsTrigger>
        <TabsTrigger value="temporary">Temporary</TabsTrigger>
      </TabsList>
      <TabsContent value="permanent" className="min-h-0 flex-1">
        <RuleEditor />
      </TabsContent>
      <TabsContent value="temporary" className="min-h-0 flex-1">
        <TemporaryRules />
      </TabsContent>
    </Tabs>
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
