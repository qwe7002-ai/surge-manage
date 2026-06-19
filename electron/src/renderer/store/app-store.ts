import { create } from "zustand";
import {
  aggregateTraffic,
  parseActive,
  parseEnvironment,
  parsePolicies,
  parsePolicyTests,
  parseExternalResources,
  parseRules,
  parseSubPolicies,
  parseTempRules,
  type ActiveConnection,
  type ConnectionState,
  type Environment,
  type ExternalResource,
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
  tempRules: string[];
  resources: ExternalResource[];
  traffic: Traffic | null;
  connections: ActiveConnection[];
  profiles: string[];
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
  refreshTempRules: () => Promise<void>;
  addTempRule: (rule: string) => Promise<void>;
  delTempRule: (rule: string) => Promise<void>;
  flushTempRules: () => Promise<void>;
  refreshResources: () => Promise<void>;
  updateResource: (key: string) => Promise<void>;
  updateAllResources: () => Promise<void>;
  refreshTraffic: () => Promise<void>;
  selectPolicy: (group: string, policy: string) => Promise<void>;
  setProxyMode: (mode: number) => Promise<void>;
  setToggle: (key: string, on: boolean) => Promise<void>;
  killConnection: (id: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  switchProfile: (name: string) => Promise<void>;
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
  tempRules: [],
  resources: [],
  traffic: null,
  connections: [],
  profiles: [],
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
        void get().refreshProfiles();
      }
      if (connection.phase === "disconnected" || connection.phase === "error") {
        set({
          environment: null,
          policies: null,
          subPolicies: {},
          policyTests: {},
          rules: [],
          tempRules: [],
          resources: [],
          traffic: null,
          connections: [],
          profiles: [],
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

  async refreshTempRules() {
    try {
      const r = await window.surge.surge.run("dumpTempRule");
      set({ tempRules: parseTempRules(r.stdout) });
    } catch {
      set({ tempRules: [] });
    }
  },

  async addTempRule(rule) {
    await guarded(set, async () => {
      await window.surge.surge.run("addTempRule", [rule]);
      await get().refreshTempRules();
    });
  },

  async delTempRule(rule) {
    await guarded(set, async () => {
      await window.surge.surge.run("delTempRule", [rule]);
      await get().refreshTempRules();
    });
  },

  async flushTempRules() {
    await guarded(set, async () => {
      await window.surge.surge.run("flushTempRule");
      await get().refreshTempRules();
    });
  },

  async refreshResources() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("externalResourceList");
      set({ resources: parseExternalResources(r.stdout) });
    });
  },

  async updateResource(key) {
    await guarded(set, async () => {
      await window.surge.surge.run("externalResourceUpdate", [key]);
      await get().refreshResources();
    });
  },

  async updateAllResources() {
    await guarded(set, async () => {
      await window.surge.surge.run("externalResourceUpdateAll");
      await get().refreshResources();
    });
  },

  async refreshTraffic() {
    try {
      const r = await window.surge.surge.run("dumpActive");
      const connections = parseActive(r.stdout);
      set({ connections, traffic: aggregateTraffic(connections) });
    } catch {
      /* polling is best-effort */
    }
  },

  async setToggle(key, on) {
    await guarded(set, async () => {
      await window.surge.surge.run("setEnvironment", [key, String(on ? 1 : 0)]);
      await get().refreshEnvironment();
    });
  },

  async killConnection(id) {
    await guarded(set, async () => {
      await window.surge.surge.run("kill", [id]);
      await get().refreshTraffic();
    });
  },

  async refreshProfiles() {
    try {
      set({ profiles: await window.surge.profiles.list() });
    } catch {
      set({ profiles: [] });
    }
  },

  async switchProfile(name) {
    await guarded(set, async () => {
      await window.surge.surge.run("switchProfile", [name]);
      await get().refreshEnvironment();
      await get().refreshPolicies();
    });
  },

  async selectPolicy(group, policy) {
    await guarded(set, async () => {
      await window.surge.surge.run("setEnvironment", [
        `ProxyGroupSelection.${group}`,
        policy,
      ]);
      await get().refreshEnvironment();
    });
  },

  async setProxyMode(mode) {
    await guarded(set, async () => {
      await window.surge.surge.run("setEnvironment", ["ProxyMode", String(mode)]);
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
