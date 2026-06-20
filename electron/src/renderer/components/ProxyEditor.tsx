import { useState } from "react";
import {
  PROXY_PROTOCOLS,
  type ProxyConfig,
  type ProxyFieldSpec,
  getProxyParam,
  groupedProxyFields,
  isRestrictedProtocol,
  parseProxyLine,
  protocolUsesServer,
  proxyFieldsFor,
  serializeProxyLine,
  setProxyParam,
} from "@surge-manage/shared";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel for select options whose underlying value is the empty string. */
const EMPTY = "__empty__";

/**
 * Structured form for a single `[Proxy]` entry, modelled on Surge's own
 * "Edit Proxy" dialog. Edits a parsed {@link ProxyConfig}; a "Raw" switch falls
 * back to editing the verbatim line for protocols/parameters the form doesn't
 * surface. Every change is serialised back and lifted via {@link onChange}.
 */
export function ProxyEditor({
  initialLine,
  policies = [],
  interfaces = [],
  onChange,
}: {
  initialLine: string;
  /** All proxies and policy groups, offered as underlying-proxy choices. */
  policies?: string[];
  /** The host's network interface names, offered for interface binding. */
  interfaces?: string[];
  onChange: (line: string) => void;
}) {
  const parsedInitial = parseProxyLine(initialLine);
  const [config, setConfig] = useState<ProxyConfig | null>(parsedInitial ?? null);
  // Lines we can't parse open straight into raw mode.
  const [rawMode, setRawMode] = useState(!parsedInitial);
  const [rawText, setRawText] = useState(initialLine);
  const [parseError, setParseError] = useState<string | null>(null);

  function update(next: ProxyConfig) {
    setConfig(next);
    onChange(serializeProxyLine(next));
  }

  function setParam(key: string, value: string) {
    if (config) update(setProxyParam(config, key, value));
  }

  function toggleRaw(toRaw: boolean) {
    if (toRaw) {
      if (config) setRawText(serializeProxyLine(config));
      setRawMode(true);
      setParseError(null);
      return;
    }
    const parsed = parseProxyLine(rawText);
    if (!parsed) {
      setParseError("Can't parse this line. Expected: Name = type, server, port, …");
      return;
    }
    setConfig(parsed);
    setRawMode(false);
    setParseError(null);
    onChange(serializeProxyLine(parsed));
  }

  // Fields that apply to the current protocol (e.g. `direct` only binds an interface).
  const fields = config ? proxyFieldsFor(config.type) : [];
  const fieldKeys = new Set(fields.map((f) => f.key.toLowerCase()));
  // Parameters with no dedicated control, surfaced as generic editable rows.
  const extraParams = config
    ? config.params
        .map((p, i) => ({ ...p, i }))
        .filter((p) => !fieldKeys.has(p.key.toLowerCase()))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="proxy-raw" className="text-xs text-muted-foreground">
          Raw
        </Label>
        <Switch id="proxy-raw" checked={rawMode} onCheckedChange={toggleRaw} />
      </div>

      {rawMode ? (
        <div className="space-y-2">
          <textarea
            value={rawText}
            spellCheck={false}
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Name = type, server, port, key=value, …"
            onChange={(ev) => {
              setRawText(ev.target.value);
              onChange(ev.target.value);
            }}
          />
          {parseError && <p className="text-xs text-destructive">{parseError}</p>}
        </div>
      ) : config ? (
        <FormBody
          config={config}
          policies={policies}
          interfaces={interfaces}
          extraParams={extraParams}
          onName={(name) => update({ ...config, name })}
          onType={(type) => update({ ...config, type })}
          onServer={(server) => update({ ...config, server })}
          onPort={(port) => update({ ...config, port })}
          onParam={setParam}
          onParamKey={(i, key) => {
            const params = config.params.map((p, idx) =>
              idx === i ? { ...p, key } : p,
            );
            update({ ...config, params });
          }}
          onParamValue={(i, value) => {
            const params = config.params.map((p, idx) =>
              idx === i ? { ...p, value } : p,
            );
            update({ ...config, params });
          }}
          onParamRemove={(i) =>
            update({ ...config, params: config.params.filter((_, idx) => idx !== i) })
          }
          onParamAdd={() =>
            update({ ...config, params: [...config.params, { key: "", value: "" }] })
          }
        />
      ) : null}
    </div>
  );
}

function FormBody({
  config,
  policies,
  interfaces,
  extraParams,
  onName,
  onType,
  onServer,
  onPort,
  onParam,
  onParamKey,
  onParamValue,
  onParamRemove,
  onParamAdd,
}: {
  config: ProxyConfig;
  policies: string[];
  interfaces: string[];
  extraParams: { key: string; value: string; i: number }[];
  onName: (v: string) => void;
  onType: (v: string) => void;
  onServer: (v: string) => void;
  onPort: (v: string) => void;
  onParam: (key: string, value: string) => void;
  onParamKey: (i: number, key: string) => void;
  onParamValue: (i: number, value: string) => void;
  onParamRemove: (i: number) => void;
  onParamAdd: () => void;
}) {
  const protocols =
    PROXY_PROTOCOLS.some((p) => p.value === config.type) || !config.type
      ? PROXY_PROTOCOLS
      : [{ value: config.type, label: config.type }, ...PROXY_PROTOCOLS];
  const showServer = protocolUsesServer(config.type);
  const groups = groupedProxyFields(config.type);
  // Restricted protocols (e.g. direct) take no free-form params; only keep the
  // section if the line already carries extras, so nothing is silently dropped.
  const showAdditional =
    !isRestrictedProtocol(config.type) || extraParams.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_12rem] items-end gap-3">
        <Field label="Name">
          <Input value={config.name} onChange={(e) => onName(e.target.value)} />
        </Field>
        <Field label="Protocol">
          <Select value={config.type} onValueChange={onType}>
            <SelectTrigger>
              <SelectValue placeholder="protocol…" />
            </SelectTrigger>
            <SelectContent>
              {protocols.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {showServer && (
        <Section title="Server Information">
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Server Address">
              <Input
                value={config.server ?? ""}
                placeholder="example.com"
                onChange={(e) => onServer(e.target.value)}
              />
            </Field>
            <Field label="Port">
              <Input
                value={config.port ?? ""}
                inputMode="numeric"
                placeholder="443"
                onChange={(e) => onPort(e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {groups.map((group) => (
        <Section key={group.id} title={group.title}>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {group.fields.map((spec) => (
              <ParamField
                key={spec.key}
                spec={spec}
                value={getProxyParam(config, spec.key) ?? ""}
                policies={policies}
                interfaces={interfaces}
                onChange={(v) => onParam(spec.key, v)}
              />
            ))}
          </div>
        </Section>
      ))}

      {showAdditional && (
        <Section title="Additional Parameters">
          <div className="space-y-1.5">
            {extraParams.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No additional parameters. Anything Surge supports can be added here.
              </p>
            )}
            {extraParams.map((p) => (
              <div key={p.i} className="flex items-center gap-1.5">
                <Input
                  value={p.key}
                  placeholder="key"
                  className="h-8 w-44 font-mono text-xs"
                  onChange={(e) => onParamKey(p.i, e.target.value)}
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  value={p.value}
                  placeholder="value"
                  className="h-8 flex-1 font-mono text-xs"
                  onChange={(e) => onParamValue(p.i, e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-destructive"
                  title="Remove parameter"
                  onClick={() => onParamRemove(p.i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-1" onClick={onParamAdd}>
              <Plus /> Add parameter
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

function ParamField({
  spec,
  value,
  policies,
  interfaces,
  onChange,
}: {
  spec: ProxyFieldSpec;
  value: string;
  policies: string[];
  interfaces: string[];
  onChange: (v: string) => void;
}) {
  if (spec.kind === "policy" || spec.kind === "interface") {
    // A "none" entry (empty) plus the live suggestions; keep an unknown current
    // value so a hand-written interface/policy isn't lost.
    const suggestions = spec.kind === "policy" ? policies : interfaces;
    const noneLabel = spec.placeholder ?? (spec.kind === "policy" ? "Not Use" : "Default");
    const options =
      value && !suggestions.includes(value) ? [value, ...suggestions] : suggestions;
    return (
      <Field label={spec.label} hint={spec.hint}>
        <Select
          value={value === "" ? EMPTY : value}
          onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={noneLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY}>{noneLabel}</SelectItem>
            {options.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (spec.kind === "toggle") {
    const on = value === "true" || value === "1";
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label>{spec.label}</Label>
          {spec.hint && (
            <p className="text-xs text-muted-foreground">{spec.hint}</p>
          )}
        </div>
        <Switch
          checked={on}
          onCheckedChange={(c) => onChange(c ? "true" : "")}
        />
      </div>
    );
  }

  if (spec.kind === "select" && spec.options) {
    // An explicit value equal to Surge's implicit default collapses to absence,
    // so e.g. block-quic=auto renders as the empty "Auto" option.
    const normalized = spec.defaultValue && value === spec.defaultValue ? "" : value;
    return (
      <Field label={spec.label} hint={spec.hint}>
        <Select
          value={normalized === "" ? EMPTY : normalized}
          onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.options.map((o) => (
              <SelectItem key={o.value || EMPTY} value={o.value || EMPTY}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <Field label={spec.label} hint={spec.hint}>
      <Input
        type={spec.kind === "password" ? "password" : "text"}
        value={value}
        placeholder={spec.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}
