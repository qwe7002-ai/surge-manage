import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { RuleEntry } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/store/app-store";

/**
 * Editor for the active profile's `[Rule]` section. Unlike the generic
 * SectionEditor, it surfaces `#`-disabled rules with an enable/disable switch
 * and preserves them on save (a disabled rule is written back as `# <rule>`).
 */
export function RuleEditor() {
  const profiles = useApp((s) => s.profiles);
  const activeProfile = useApp((s) => s.activeProfile);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const readProfileRules = useApp((s) => s.readProfileRules);
  const writeProfileRules = useApp((s) => s.writeProfileRules);
  const busy = useApp((s) => s.busy);

  const [entries, setEntries] = useState<RuleEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await readProfileRules(activeProfile));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, readProfileRules]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(i: number, next: Partial<RuleEntry>) {
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...next } : e)));
    setDirty(true);
  }
  function remove(i: number) {
    setEntries((es) => es.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function add() {
    setEntries((es) => [...es, { text: "", enabled: true }]);
    setDirty(true);
  }

  async function save() {
    if (!activeProfile) return;
    setError(null);
    const cleaned = entries
      .map((e) => ({ text: e.text.trim(), enabled: e.enabled }))
      .filter((e) => e.text);
    try {
      await writeProfileRules(activeProfile, cleaned);
      setEntries(cleaned);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (profiles.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">
        No profiles found. Set the host's config directory to edit profiles.
      </p>
    );
  }

  const disabledCount = entries.filter((e) => !e.enabled).length;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex items-center gap-2">
        <Select value={activeProfile ?? undefined} onValueChange={setActiveProfile}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="profile…" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p} value={p}>
                {p}.conf
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{entries.length}</Badge>
        {disabledCount > 0 && (
          <Badge variant="outline">{disabledCount} disabled</Badge>
        )}
        {dirty && <span className="text-xs text-amber-500">unsaved</span>}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
            <RefreshCw /> Reload
          </Button>
          <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>
            <Save /> Save &amp; reload
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Edits the [Rule] section of the selected profile, then reloads Surge. A
        disabled rule is kept as <code>#</code> in the config.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {loading && entries.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Switch
              checked={e.enabled}
              onCheckedChange={(v) => patch(i, { enabled: v })}
              title={e.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
            />
            <Input
              value={e.text}
              placeholder="DOMAIN-SUFFIX,example.com,Proxy"
              className={`h-8 font-mono text-xs ${
                e.enabled ? "" : "text-muted-foreground line-through"
              }`}
              onChange={(ev) => patch(i, { text: ev.target.value })}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-destructive"
              title="Delete"
              onClick={() => remove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="mt-1" onClick={add}>
          <Plus /> Add rule
        </Button>
      </div>
    </div>
  );
}
