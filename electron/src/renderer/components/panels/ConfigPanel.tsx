import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import type { SurgeAction } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";

type Which = "original" | "effective";

/**
 * Config panel: edits the selected profile's raw `.conf` file directly. The
 * "Original" view is the editable on-disk file (saved back, validated, and
 * reloaded); "Effective" is the read-only resolved profile from Surge.
 */
export function ConfigPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const profiles = useApp((s) => s.profiles);
  const activeProfile = useApp((s) => s.activeProfile);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const refreshProfiles = useApp((s) => s.refreshProfiles);
  const writeProfileRaw = useApp((s) => s.writeProfileRaw);
  const busy = useApp((s) => s.busy);

  const [which, setWhich] = useState<Which>("original");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) void refreshProfiles();
  }, [connected, refreshProfiles]);

  const load = useCallback(async (w: Which, profile: string | null) => {
    setLoading(true);
    setError(null);
    try {
      if (w === "original") {
        setContent(profile ? await window.surge.profiles.read(profile) : "");
      } else {
        const action: SurgeAction = "dumpProfileEffective";
        const r = await window.surge.surge.run(action);
        const text = r.stdout.trim();
        setContent(
          text === "(null)" || text.endsWith("(null)")
            ? "Effective profile is not available from this Surge CLI context."
            : r.stdout,
        );
      }
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(which, activeProfile);
  }, [which, activeProfile, load]);

  async function save() {
    if (!activeProfile || which !== "original") return;
    setError(null);
    try {
      await writeProfileRaw(activeProfile, content);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!connected) return <Disconnected />;

  const editable = which === "original";

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={which} onValueChange={(v) => setWhich(v as Which)}>
          <TabsList>
            <TabsTrigger value="original">Original</TabsTrigger>
            <TabsTrigger value="effective">Effective</TabsTrigger>
          </TabsList>
        </Tabs>
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
        {editable && <Badge variant="outline">editing</Badge>}
        {dirty && <span className="text-xs text-amber-500">unsaved</span>}
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => void load(which, activeProfile)}
          >
            <RefreshCw /> Reload
          </Button>
          {editable && (
            <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>
              <Save /> Save &amp; reload
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {editable
          ? "Edits the selected profile's raw .conf file. On save it is validated with surge --check (a .bak backup is kept) and reloaded."
          : "Read-only resolved profile as Surge sees it after includes and overrides."}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {editable ? (
        <textarea
          value={content}
          spellCheck={false}
          disabled={loading || !activeProfile}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          className="min-h-0 flex-1 resize-none overflow-auto rounded-md border bg-black/40 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder={loading ? "Loading…" : "No profile selected."}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-xs leading-relaxed">
          {content || (loading ? "Loading…" : "No profile returned.")}
        </pre>
      )}
    </div>
  );
}
