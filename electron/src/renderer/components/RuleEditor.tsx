import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Pencil, Plus, Power, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  BUILTIN_POLICIES,
  LOGICAL_RULE_TYPES,
  RULE_OPTIONS,
  RULE_TYPES,
  type LogicalSubRule,
  type RuleEntry,
  parseLogicalRule,
  parseRuleLine,
  ruleTypeHasValue,
  serializeLogicalRule,
  serializeRuleLine,
} from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/store/app-store";

/** Matcher types usable as a logical sub-condition (every type but FINAL). */
const MATCHER_TYPES = RULE_TYPES.filter((t) => t !== "FINAL");

interface EditorState {
  /** Index being edited, or null when adding a new rule. */
  index: number | null;
  text: string;
}

/**
 * Editor for the active profile's `[Rule]` section. Rules render as readable,
 * drag-reorderable rows (type → value → policy) with an enable/disable switch
 * and a right-click menu for edit/delete; new and existing rules are edited in
 * a dialog with Single / Logical / Raw tabs. `#`-disabled rules and plain
 * comments are preserved across a save.
 */
export function RuleEditor() {
  const profiles = useApp((s) => s.profiles);
  const activeProfile = useApp((s) => s.activeProfile);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const readProfileRules = useApp((s) => s.readProfileRules);
  const writeProfileRules = useApp((s) => s.writeProfileRules);
  const policiesDump = useApp((s) => s.policies);
  const busy = useApp((s) => s.busy);

  const [entries, setEntries] = useState<RuleEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Built-in targets plus every defined proxy and policy group.
  const policies = useMemo(() => {
    const all = [
      ...BUILTIN_POLICIES,
      ...(policiesDump?.proxies ?? []),
      ...(policiesDump?.groups ?? []),
    ];
    return Array.from(new Set(all));
  }, [policiesDump]);

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

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function patch(i: number, next: Partial<RuleEntry>) {
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...next } : e)));
    setDirty(true);
  }
  function remove(i: number) {
    setEntries((es) => es.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  /** Move the rule at `from` to `to`, preserving the rest of the order. */
  function move(from: number, to: number) {
    if (from === to) return;
    setEntries((es) => {
      const next = [...es];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    setDirty(true);
  }
  function saveEditor(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setEntries((es) => {
      if (editor?.index == null) {
        // New rules go to the top, where the Add button is.
        return [{ text: clean, enabled: true, comment: false }, ...es];
      }
      return es.map((e, idx) => (idx === editor.index ? { ...e, text: clean } : e));
    });
    setDirty(true);
    setEditor(null);
  }

  async function save() {
    if (!activeProfile) return;
    setError(null);
    const cleaned = entries
      .map((e) => ({ text: e.text.trim(), enabled: e.enabled, comment: e.comment }))
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

  const disabledCount = entries.filter((e) => !e.enabled && !e.comment).length;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => setEditor({ index: null, text: "" })}>
          <Plus /> Add rule
        </Button>
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
        {disabledCount > 0 && <Badge variant="outline">{disabledCount} disabled</Badge>}
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
        Drag the handle to reorder. Right-click a rule to edit, enable/disable, or delete it.
        Disabled rules and comments are kept as <code>#</code> lines and survive a save.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {loading && entries.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {!loading && entries.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            No rules. Click “Add rule” to create one.
          </p>
        )}
        {entries.map((e, i) => (
          <RuleRow
            key={i}
            entry={e}
            dragging={dragIndex === i}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDropOver={() => {
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(i);
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              setMenu({ index: i, x: ev.clientX, y: ev.clientY });
            }}
            onToggle={() => patch(i, { enabled: !e.enabled })}
            onEdit={() => setEditor({ index: i, text: e.text })}
          />
        ))}
      </div>

      {menu && (
        <RuleMenu
          x={menu.x}
          y={menu.y}
          entry={entries[menu.index]!}
          onEdit={() => {
            setEditor({ index: menu.index, text: entries[menu.index]!.text });
            setMenu(null);
          }}
          onToggle={() => {
            patch(menu.index, { enabled: !entries[menu.index]!.enabled });
            setMenu(null);
          }}
          onDelete={() => {
            remove(menu.index);
            setMenu(null);
          }}
        />
      )}

      {editor && (
        <RuleDialog
          state={editor}
          policies={policies}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
    </div>
  );
}

function RuleRow({
  entry,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOver,
  onContextMenu,
  onToggle,
  onEdit,
}: {
  entry: RuleEntry;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOver: () => void;
  onContextMenu: React.MouseEventHandler;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const dragProps = {
    draggable: true,
    onDragStart,
    onDragEnd,
    onDragOver: (ev: React.DragEvent) => {
      ev.preventDefault();
      onDropOver();
    },
  };
  const handle = (
    <span
      className="shrink-0 cursor-grab text-muted-foreground/60 active:cursor-grabbing"
      title="Drag to reorder"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
  const dragClass = dragging ? "opacity-40" : "";

  if (entry.comment) {
    return (
      <div
        {...dragProps}
        className={`flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground ${dragClass}`}
        onContextMenu={onContextMenu}
      >
        {handle}
        <span className="font-mono">#</span>
        <span className="truncate italic">{entry.text}</span>
      </div>
    );
  }

  const rule = parseRuleLine(entry.text);
  const logical = rule ? undefined : parseLogicalRule(entry.text);
  const dim = entry.enabled ? "" : "opacity-50";
  return (
    <div
      {...dragProps}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors hover:bg-accent ${dragClass}`}
      onContextMenu={onContextMenu}
      onDoubleClick={onEdit}
      title="Drag to reorder · right-click for options"
    >
      {handle}
      <Switch
        checked={entry.enabled}
        onCheckedChange={onToggle}
        title={entry.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
      />
      {rule ? (
        <div className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${dim}`}>
          <Badge variant="outline" className="shrink-0 text-[10px] font-medium">
            {rule.type}
          </Badge>
          {rule.value && (
            <span className="truncate font-mono text-xs" title={rule.value}>
              {rule.value}
            </span>
          )}
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {rule.policy}
          </Badge>
          {rule.options.map((o) => (
            <Badge key={o} variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              {o}
            </Badge>
          ))}
        </div>
      ) : logical ? (
        <div className={`flex min-w-0 flex-1 items-center gap-1.5 text-sm ${dim}`}>
          <Badge className="shrink-0 text-[10px] font-medium">{logical.operator}</Badge>
          <span className="truncate font-mono text-xs" title={entry.text}>
            {logical.conditions.map((c) => `${c.type},${c.value}`).join(" · ")}
          </span>
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {logical.policy}
          </Badge>
        </div>
      ) : (
        <code className={`min-w-0 flex-1 truncate text-xs ${dim}`} title={entry.text}>
          {entry.text}
        </code>
      )}
    </div>
  );
}

function RuleMenu({
  x,
  y,
  entry,
  onEdit,
  onToggle,
  onDelete,
}: {
  x: number;
  y: number;
  entry: RuleEntry;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed z-50 min-w-40 overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md"
      style={{ left: x, top: y }}
      onClick={(ev) => ev.stopPropagation()}
    >
      <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="Edit" onClick={onEdit} />
      {!entry.comment && (
        <MenuItem
          icon={<Power className="h-3.5 w-3.5" />}
          label={entry.enabled ? "Disable" : "Enable"}
          onClick={onToggle}
        />
      )}
      <MenuItem
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label="Delete"
        destructive
        onClick={onDelete}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent ${
        destructive ? "text-destructive" : ""
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

/** Sentinel for select options whose underlying value is the empty string. */
const NONE = "__none__";

type DialogTab = "single" | "logical" | "raw";

function RuleDialog({
  state,
  policies,
  onCancel,
  onSave,
}: {
  state: EditorState;
  policies: string[];
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const single = parseRuleLine(state.text);
  const logical = parseLogicalRule(state.text);
  const adding = state.index == null;

  const [tab, setTab] = useState<DialogTab>(
    logical ? "logical" : single || !state.text.trim() ? "single" : "raw",
  );

  // Single-matcher state.
  const [type, setType] = useState(single?.type ?? "DOMAIN-SUFFIX");
  const [value, setValue] = useState(single?.value ?? "");
  const [policy, setPolicy] = useState(single?.policy ?? "");
  const [options, setOptions] = useState<string[]>(single?.options ?? []);

  // Logical-rule state.
  const [operator, setOperator] = useState(logical?.operator ?? "AND");
  const [conditions, setConditions] = useState<LogicalSubRule[]>(
    logical?.conditions ?? [{ type: "DOMAIN-SUFFIX", value: "" }],
  );
  const [logicPolicy, setLogicPolicy] = useState(logical?.policy ?? "");

  // Raw state.
  const [rawText, setRawText] = useState(state.text);

  const hasValue = ruleTypeHasValue(type);
  const optionChoices = Array.from(new Set([...RULE_OPTIONS, ...options]));

  const text =
    tab === "single"
      ? serializeRuleLine({ type, value, policy, options })
      : tab === "logical"
        ? serializeLogicalRule({
            operator,
            conditions: conditions.filter((c) => c.type && c.value),
            policy: logicPolicy,
            options: [],
          })
        : rawText.trim();

  const canSave =
    tab === "single"
      ? !!type && !!policy && (!hasValue || !!value)
      : tab === "logical"
        ? !!logicPolicy && conditions.some((c) => c.type && c.value)
        : !!rawText.trim();

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{adding ? "Add rule" : "Edit rule"}</DialogTitle>
          <DialogDescription>
            Build a <code>[Rule]</code> entry. Changes apply when you save and reload.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DialogTab)}>
          <TabsList>
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="logical">Logical</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(RULE_TYPES.includes(type as (typeof RULE_TYPES)[number])
                      ? RULE_TYPES
                      : [type, ...RULE_TYPES]
                    ).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <PolicySelect label="Policy" value={policy} policies={policies} onChange={setPolicy} />
            </div>

            {hasValue && (
              <div className="space-y-1.5">
                <Label>Value</Label>
                <Input
                  autoFocus
                  value={value}
                  className="font-mono text-xs"
                  placeholder={valuePlaceholder(type)}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="flex flex-wrap gap-3">
                {optionChoices.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={options.includes(opt)}
                      onCheckedChange={(on) =>
                        setOptions((os) => (on ? [...os, opt] : os.filter((o) => o !== opt)))
                      }
                    />
                    <span className="font-mono">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logical" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Operator</Label>
                <Select value={operator} onValueChange={setOperator}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGICAL_RULE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <PolicySelect
                label="Policy"
                value={logicPolicy}
                policies={policies}
                onChange={setLogicPolicy}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Conditions</Label>
              <div className="space-y-1.5">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select
                      value={c.type}
                      onValueChange={(v) =>
                        setConditions((cs) =>
                          cs.map((x, idx) => (idx === i ? { ...x, type: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {MATCHER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={c.value}
                      placeholder="value"
                      className="h-8 flex-1 font-mono text-xs"
                      onChange={(e) =>
                        setConditions((cs) =>
                          cs.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive"
                      title="Remove condition"
                      disabled={conditions.length === 1}
                      onClick={() =>
                        setConditions((cs) => cs.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setConditions((cs) => [...cs, { type: "DOMAIN-SUFFIX", value: "" }])
                  }
                >
                  <Plus /> Add condition
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="raw">
            <Input
              autoFocus
              value={rawText}
              className="font-mono text-xs"
              placeholder="AND,((DOMAIN,a.com),(DEST-PORT,80)),Proxy"
              onChange={(e) => setRawText(e.target.value)}
            />
          </TabsContent>
        </Tabs>

        <p className="truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={text}>
          {text || "—"}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => onSave(text)}>
            {adding ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicySelect({
  label,
  value,
  policies,
  onChange,
}: {
  label: string;
  value: string;
  policies: string[];
  onChange: (v: string) => void;
}) {
  const options = value && !policies.includes(value) ? [value, ...policies] : policies;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value === "" ? NONE : value} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="select…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function valuePlaceholder(type: string): string {
  switch (type.toUpperCase()) {
    case "DOMAIN":
    case "DOMAIN-SUFFIX":
    case "DOMAIN-KEYWORD":
      return "example.com";
    case "IP-CIDR":
      return "10.0.0.0/8";
    case "IP-CIDR6":
      return "2620:0:2d0::/44";
    case "GEOIP":
      return "CN";
    case "IP-ASN":
      return "13335";
    case "DEST-PORT":
    case "SRC-PORT":
    case "IN-PORT":
      return "443";
    case "RULE-SET":
      return "https://example.com/ruleset or SYSTEM / LAN";
    case "USER-AGENT":
      return "WeChat*";
    default:
      return "value";
  }
}
