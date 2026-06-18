import { create } from "zustand";
import {
  aggregateTraffic,
  parseActive,
  parseEnvironment,
  parsePolicies,
  parsePolicyTests,
  parseRules,
  parseSubPolicies,
  type ConnectionState,
  type Environment,
  type HostConfig,
  type LogLine,
  type PolicyDump,
  type PolicyTest,
  type Rule,
  type SurgeAction,
  type Traffic,
} from "@surge-manage/shared";

const MAX_LOG_LINES = 2000;

interface AppState {
  hosts: HostConfig[];
  selectedHostId: string | null;
  connection: ConnectionState;
  environment: Environment | null;
  policies: PolicyDump | null;
  subPolicies: Record<string, string[]>;
  policyTests: Record<string, PolicyTest>;
  rules: Rule[];
  traffic: Traffic | null;
  logs: LogLine[];
  logStreaming: boolean;
  busy: boolean;
  lastError: string | null;
  lastInfo: string | null;

  init: () => Promise<void>;
  refreshHosts: () => Promise<void>;
  selectHost: (id: string | null) => void;
  saveHost: (host: HostConfig) => Promise<void>;
  removeHost: (id: string) => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshEnvironment: () => Promise<void>;
  refreshPolicies: () => Promise<void>;
  refreshRules: () => Promise<void>;
  refreshTraffic: () => Promise<void>;
  selectPolicy: (group: string, policy: string) => Promise<void>;
  setProxyMode: (mode: number) => Promise<void>;
  testAllPolicies: () => Promise<void>;
  testGroup: (name: string) => Promise<void>;
  /** Run a no-arg or single-arg surge action and surface its result text. */
  runAction: (action: SurgeAction, args?: string[]) => Promise<void>;
  startLogs: () => Promise<void>;
  stopLogs: () => Promise<void>;
  clearLogs: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  hosts: [],
  selectedHostId: null,
  connection: { phase: "disconnected", since: Date.now() },
  environment: null,
  policies: null,
  subPolicies: {},
  policyTests: {},
  rules: [],
  traffic: null,
  logs: [],
  logStreaming: false,
  busy: false,
  lastError: null,
  lastInfo: null,

  async init() {
    window.surge.connection.onState((connection) => {
      set({ connection });
      if (connection.phase === "connected") {
        // Pull an initial snapshot once the session is live.
        void get().refreshEnvironment();
        void get().refreshPolicies();
        void get().refreshTraffic();
      }
      if (connection.phase === "disconnected" || connection.phase === "error") {
        set({
          environment: null,
          policies: null,
          subPolicies: {},
          policyTests: {},
          rules: [],
          traffic: null,
          logStreaming: false,
        });
      }
    });
    window.surge.logs.onLine((line) => {
      set((s) => {
        const next = [...s.logs, line];
        return { logs: next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next };
      });
    });
    await get().refreshHosts();
  },

  async refreshHosts() {
    const hosts = await window.surge.hosts.list();
    set((s) => ({
      hosts,
      selectedHostId: s.selectedHostId ?? hosts[0]?.id ?? null,
    }));
  },

  selectHost(id) {
    set({ selectedHostId: id });
  },

  async saveHost(host) {
    await window.surge.hosts.save(host);
    await get().refreshHosts();
    set({ selectedHostId: host.id });
  },

  async removeHost(id) {
    await window.surge.hosts.remove(id);
    set((s) => ({
      selectedHostId: s.selectedHostId === id ? null : s.selectedHostId,
    }));
    await get().refreshHosts();
  },

  async connect(id) {
    set({ lastError: null });
    try {
      await window.surge.connection.connect(id);
    } catch (e) {
      set({ lastError: errText(e) });
    }
  },

  async disconnect() {
    await window.surge.connection.disconnect();
  },

  async refreshEnvironment() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("environment");
      set({ environment: parseEnvironment(r.stdout) });
    });
  },

  async refreshPolicies() {
    await guarded(set, async () => {
      const [dump, subs] = await Promise.all([
        window.surge.surge.run("dumpPolicy"),
        window.surge.surge.run("dumpPolicySubPolicies").catch(() => null),
      ]);
      set({
        policies: parsePolicies(dump.stdout),
        subPolicies: subs ? parseSubPolicies(subs.stdout) : {},
      });
      // Selection lives in the environment dictionary.
      await get().refreshEnvironment();
    });
  },

  async refreshRules() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("dumpRule");
      set({ rules: parseRules(r.stdout) });
    });
  },

  async refreshTraffic() {
    try {
      const r = await window.surge.surge.run("dumpActive");
      set({ traffic: aggregateTraffic(parseActive(r.stdout)) });
    } catch {
      /* polling is best-effort */
    }
  },

  async selectPolicy(group, policy) {
    await guarded(set, async () => {
      await window.surge.surge.run("setEnvironment", [
        `ProxyGroupSelection.${group}=${policy}`,
      ]);
      await get().refreshEnvironment();
    });
  },

  async setProxyMode(mode) {
    await guarded(set, async () => {
      await window.surge.surge.run("setEnvironment", [`ProxyMode=${mode}`]);
      await get().refreshEnvironment();
    });
  },

  async testAllPolicies() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("testAllPolicies");
      mergeTests(set, get, parsePolicyTests(r.stdout));
    });
  },

  async testGroup(name) {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("testGroup", [name]);
      mergeTests(set, get, parsePolicyTests(r.stdout));
      set({ lastInfo: `Retested group "${name}"` });
    });
  },

  async runAction(action, args = []) {
    await guarded(set, async () => {
      const r = await window.surge.surge.run(action, args);
      const text = r.stdout.trim();
      set({ lastInfo: text ? text.slice(0, 4000) : `${action} ok` });
    });
  },

  async startLogs() {
    if (get().logStreaming) return;
    set({ logStreaming: true });
    try {
      await window.surge.logs.start();
    } catch (e) {
      set({ logStreaming: false, lastError: errText(e) });
    }
  },

  async stopLogs() {
    if (!get().logStreaming) return;
    set({ logStreaming: false });
    try {
      await window.surge.logs.stop();
    } catch {
      /* best-effort */
    }
  },

  clearLogs() {
    set({ logs: [] });
  },
}));

type SetFn = (partial: Partial<AppState>) => void;
type GetFn = () => AppState;

function mergeTests(set: SetFn, get: GetFn, tests: PolicyTest[]): void {
  const next = { ...get().policyTests };
  for (const t of tests) next[t.name] = t;
  set({ policyTests: next });
}

async function guarded(set: SetFn, fn: () => Promise<void>): Promise<void> {
  set({ busy: true, lastError: null, lastInfo: null });
  try {
    await fn();
  } catch (e) {
    set({ lastError: errText(e) });
  } finally {
    set({ busy: false });
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
