import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/store/app-store";

interface Props {
  /** Config section name, e.g. "Rule" or "Proxy". */
  section: string;
  /** Placeholder shown in empty entry inputs. */
  placeholder: string;
  /** Short hint rendered above the list. */
  hint?: string;
}

/**
 * Per-entry editor for one section of the active profile config. Reads the
 * section's entry lines over SFTP, lets the user add/edit/delete them, and on
 * save rewrites just that section and reloads Surge.
 */
export function SectionEditor({ section, placeholder, hint }: Props) {
  const profiles = useApp((s) => s.profiles);
  const activeProfile = useApp((s) => s.activeProfile);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const readProfileSection = useApp((s) => s.readProfileSection);
  const writeProfileSection = useApp((s) => s.writeProfileSection);
  const busy = useApp((s) => s.busy);

  const [entries, setEntries] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await readProfileSection(activeProfile, section));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, section, readProfileSection]);

  useEffect(() => {
    void load();
  }, [load]);

  function update(i: number, value: string) {
    setEntries((es) => es.map((e, idx) => (idx === i ? value : e)));
    setDirty(true);
  }
  function remove(i: number) {
    setEntries((es) => es.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function add() {
    setEntries((es) => [...es, ""]);
    setDirty(true);
  }

  async function save() {
    if (!activeProfile) return;
    setError(null);
    const cleaned = entries.map((e) => e.trim()).filter(Boolean);
    try {
      await writeProfileSection(activeProfile, section, cleaned);
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

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {loading && entries.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={e}
              placeholder={placeholder}
              className="h-8 font-mono text-xs"
              onChange={(ev) => update(i, ev.target.value)}
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
          <Plus /> Add entry
        </Button>
      </div>
    </div>
  );
}
