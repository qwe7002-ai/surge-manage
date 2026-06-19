import { type MouseEventHandler, useEffect, useState } from "react";
import { Gauge, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  PROXY_MODES,
  type PolicyTest,
  proxyEntryName,
} from "@surge-manage/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Disconnected } from "@/components/Disconnected";
import { ProxyEditor } from "@/components/ProxyEditor";
import { useApp } from "@/store/app-store";

const AUTO_VALUE = "__auto__";

export function PoliciesPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const policies = useApp((s) => s.policies);
  const subPolicies = useApp((s) => s.subPolicies);
  const proxyMode = useApp((s) => s.environment?.proxyMode);
  const globalPolicy = useApp((s) => s.environment?.globalPolicy);
  const selection = useApp((s) => s.environment?.selection ?? {});
  const autoOverride = useApp((s) => s.environment?.autoOverride ?? {});
  const policyTests = useApp((s) => s.policyTests);
  const busy = useApp((s) => s.busy);
  const refreshPolicies = useApp((s) => s.refreshPolicies);
  const refreshProfiles = useApp((s) => s.refreshProfiles);
  const testPolicy = useApp((s) => s.testPolicy);
  const testAllPolicies = useApp((s) => s.testAllPolicies);
  const selectPolicy = useApp((s) => s.selectPolicy);
  const overridePolicy = useApp((s) => s.overridePolicy);
  const setProxyMode = useApp((s) => s.setProxyMode);
  const setGlobalPolicy = useApp((s) => s.setGlobalPolicy);
  const profiles = useApp((s) => s.profiles);
  const activeProfile = useApp((s) => s.activeProfile);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const readProfileSection = useApp((s) => s.readProfileSection);
  const writeProfileSection = useApp((s) => s.writeProfileSection);
  const [proxyMenu, setProxyMenu] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [proxyEditor, setProxyEditor] = useState<{
    profile: string;
    name: string;
    line: string;
  } | null>(null);
  const [proxyEditError, setProxyEditError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) {
      void refreshPolicies();
      void refreshProfiles();
    }
  }, [connected, refreshPolicies, refreshProfiles]);

  useEffect(() => {
    if (!proxyMenu) return;
    const close = () => setProxyMenu(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [proxyMenu]);

  if (!connected) return <Disconnected />;

  const proxies = policies?.proxies ?? [];
  const groups = policies?.groups ?? [];
  const groupTypes = policies?.groupTypes ?? {};
  const allPolicies = Array.from(new Set([...proxies, ...groups]));
  const policyOptions =
    globalPolicy && !allPolicies.includes(globalPolicy)
      ? [globalPolicy, ...allPolicies]
      : allPolicies;

  async function findProxyEntry(name: string): Promise<{
    profile: string;
    entries: string[];
    line: string;
  }> {
    const candidates = [
      ...(activeProfile ? [activeProfile] : []),
      ...profiles.filter((profile) => profile !== activeProfile),
    ];
    if (candidates.length === 0) throw new Error("No profiles found.");
    let lastError: unknown;
    for (const profile of candidates) {
      try {
        const entries = await readProfileSection(profile, "Proxy");
        const line = entries.find((entry) => proxyEntryName(entry) === name);
        if (line) return { profile, entries, line };
      } catch (e) {
        lastError = e;
      }
    }
    if (lastError) {
      throw new Error(
        `Proxy "${name}" was not found in editable profiles. Last read error: ${errText(lastError)}`,
      );
    }
    throw new Error(`Proxy "${name}" was not found in editable profiles.`);
  }

  async function editProxy(name: string) {
    setProxyMenu(null);
    setProxyEditError(null);
    try {
      const found = await findProxyEntry(name);
      setActiveProfile(found.profile);
      setProxyEditor({ profile: found.profile, name, line: found.line });
    } catch (e) {
      setProxyEditError(errText(e));
    }
  }

  async function deleteProxy(name: string) {
    setProxyMenu(null);
    if (!window.confirm(`Delete proxy "${name}" from [Proxy]?`)) return;
    try {
      const found = await findProxyEntry(name);
      const next = found.entries.filter((entry) => proxyEntryName(entry) !== name);
      await writeProfileSection(found.profile, "Proxy", next);
      setActiveProfile(found.profile);
      await refreshPolicies();
    } catch (e) {
      setProxyEditError(errText(e));
    }
  }

  async function saveProxyEdit() {
    if (!proxyEditor) return;
    const line = proxyEditor.line.trim();
    if (!line || !proxyEntryName(line)) {
      setProxyEditError("Proxy entry must be in the form: Name = type, ...");
      return;
    }
    try {
      const entries = await readProfileSection(proxyEditor.profile, "Proxy");
      const idx = entries.findIndex(
        (entry) => proxyEntryName(entry) === proxyEditor.name,
      );
      if (idx === -1) throw new Error(`Proxy "${proxyEditor.name}" was not found.`);
      const next = [...entries];
      next[idx] = line;
      await writeProfileSection(proxyEditor.profile, "Proxy", next);
      setActiveProfile(proxyEditor.profile);
      setProxyEditor(null);
      setProxyEditError(null);
      await refreshPolicies();
    } catch (e) {
      setProxyEditError(errText(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {groups.length} groups · {proxies.length} proxies
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Mode</span>
            <Select
              value={proxyMode != null ? String(proxyMode) : undefined}
              disabled={busy}
              onValueChange={(v) => void setProxyMode(Number(v))}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue placeholder="mode…" />
              </SelectTrigger>
              <SelectContent>
                {PROXY_MODES.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Global</span>
            <Select
              value={globalPolicy ?? undefined}
              disabled={busy || proxyMode !== 1 || policyOptions.length === 0}
              onValueChange={(v) => void setGlobalPolicy(v)}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue placeholder="policy…" />
              </SelectTrigger>
              <SelectContent>
                {policyOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <CardTitle className="text-sm">Proxies</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {proxyEditError && !proxyEditor && (
            <p className="text-xs text-destructive sm:col-span-2">
              {proxyEditError}
            </p>
          )}
          {proxies.map((p) => (
            <ProxyRow
              key={p}
              name={p}
              test={policyTests[p]}
              disabled={busy}
              onTest={() => void testPolicy(p)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setProxyMenu({ name: p, x: ev.clientX, y: ev.clientY });
              }}
            />
          ))}
        </CardContent>
      </Card>

      {proxyMenu && (
        <div
          className="fixed z-50 min-w-36 overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md"
          style={{ left: proxyMenu.x, top: proxyMenu.y }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
            onClick={() => void editProxy(proxyMenu.name)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-accent"
            onClick={() => void deleteProxy(proxyMenu.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}

      <Dialog open={!!proxyEditor} onOpenChange={(open) => !open && setProxyEditor(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Proxy</DialogTitle>
            <DialogDescription>
              Edit the [Proxy] entry “{proxyEditor?.name}” in {proxyEditor?.profile}.conf,
              then save and reload Surge.
            </DialogDescription>
          </DialogHeader>
          {proxyEditor && (
            <ProxyEditor
              key={`${proxyEditor.profile}:${proxyEditor.name}`}
              initialLine={proxyEditor.line}
              policies={allPolicies.filter((p) => p !== proxyEditor.name)}
              onChange={(line) =>
                setProxyEditor((current) => (current ? { ...current, line } : current))
              }
            />
          )}
          {proxyEditError && (
            <p className="text-xs text-destructive">{proxyEditError}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setProxyEditor(null);
                setProxyEditError(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void saveProxyEdit()}>
              Save &amp; reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Policy groups</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {groups.length === 0 && (
            <span className="text-sm text-muted-foreground">No policy groups.</span>
          )}
          {groups.map((g) => {
            const groupType = groupTypes[g] ?? "unknown";
            const isAutoGroup = groupType !== "select" && groupType !== "unknown";
            const members = subPolicies[g] ?? [];
            const fallback = [...proxies, ...groups.filter((x) => x !== g)];
            const candidates = members.length > 0 ? members : fallback;
            const currentValue = isAutoGroup ? autoOverride[g] : selection[g];
            const autoCurrent =
              isAutoGroup && selection[g] && candidates.includes(selection[g])
                ? selection[g]
                : undefined;
            const autoLabel = autoCurrent ? `Auto · ${autoCurrent}` : "Auto";
            const options =
              currentValue && !candidates.includes(currentValue)
                ? [currentValue, ...candidates]
                : candidates;
            return (
              <div
                key={g}
                className="grid grid-cols-[minmax(5.5rem,7rem)_4.25rem_minmax(0,1fr)] items-center gap-1.5"
              >
                <span className="truncate text-sm" title={g}>
                  {g}
                </span>
                <Badge
                  variant={isAutoGroup ? "secondary" : "outline"}
                  className="h-5 justify-center px-1.5 text-[10px] font-medium"
                  title={isAutoGroup ? "Automatic policy group" : "Manual policy group"}
                >
                  {groupType}
                </Badge>
                {isAutoGroup ? (
                  <Select
                    value={autoOverride[g] ?? AUTO_VALUE}
                    disabled={busy}
                    onValueChange={(v) =>
                      void overridePolicy(g, v === AUTO_VALUE ? null : v)
                    }
                  >
                    <SelectTrigger
                      className="h-8 min-w-0"
                      title={members.length > 0 ? members.join(", ") : "Auto"}
                    >
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_VALUE}>{autoLabel}</SelectItem>
                      {options.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : options.length > 0 ? (
                  <Select
                    value={selection[g] ?? undefined}
                    disabled={busy}
                    onValueChange={(v) => void selectPolicy(g, v)}
                  >
                    <SelectTrigger className="h-8 min-w-0">
                      <SelectValue placeholder="select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {selection[g] ?? "—"}
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ProxyRow({
  name,
  test,
  disabled,
  onTest,
  onContextMenu,
}: {
  name: string;
  test?: PolicyTest;
  disabled: boolean;
  onTest: () => void;
  onContextMenu: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      title="Test this policy"
      disabled={disabled}
      onClick={onTest}
      onContextMenu={onContextMenu}
    >
      <span className="truncate">{name}</span>
      <Latency test={test} />
    </button>
  );
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
