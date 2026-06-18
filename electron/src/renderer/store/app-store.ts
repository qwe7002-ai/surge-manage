import { create } from "zustand";
import {
  parsePolicies,
  parseRules,
  parseStatus,
  parseTraffic,
  type ConnectionState,
  type HostConfig,
  type LogLine,
  type PolicyGroup,
  type Rule,
  type SurgeStatus,
  type Traffic,
} from "@surge-manage/shared";

const MAX_LOG_LINES = 2000;

interface AppState {
  hosts: HostConfig[];
  selectedHostId: string | null;
  connection: ConnectionState;
  status: SurgeStatus | null;
  policies: PolicyGroup[];
  rules: Rule[];
  traffic: Traffic | null;
  logs: LogLine[];
  logStreaming: boolean;
  busy: boolean;
  lastError: string | null;

  init: () => Promise<void>;
  refreshHosts: () => Promise<void>;
  selectHost: (id: string | null) => void;
  saveHost: (host: HostConfig) => Promise<void>;
  removeHost: (id: string) => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshPolicies: () => Promise<void>;
  refreshRules: () => Promise<void>;
  refreshTraffic: () => Promise<void>;
  selectPolicy: (group: string, member: string) => Promise<void>;
  power: (action: "start" | "stop" | "restart" | "reload") => Promise<void>;
  startLogs: () => Promise<void>;
  stopLogs: () => Promise<void>;
  clearLogs: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  hosts: [],
  selectedHostId: null,
  connection: { phase: "disconnected", since: Date.now() },
  status: null,
  policies: [],
  rules: [],
  traffic: null,
  logs: [],
  logStreaming: false,
  busy: false,
  lastError: null,

  async init() {
    window.surge.connection.onState((connection) => {
      set({ connection });
      if (connection.phase === "connected") {
        // Pull an initial snapshot once the session is live.
        void get().refreshStatus();
        void get().refreshPolicies();
        void get().refreshTraffic();
      }
      if (connection.phase === "disconnected" || connection.phase === "error") {
        set({
          status: null,
          policies: [],
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

  async refreshStatus() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("status");
      set({ status: parseStatus(r.stdout) });
    });
  },

  async refreshPolicies() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("policies");
      set({ policies: parsePolicies(r.stdout) });
    });
  },

  async refreshRules() {
    await guarded(set, async () => {
      const r = await window.surge.surge.run("rules");
      set({ rules: parseRules(r.stdout) });
    });
  },

  async refreshTraffic() {
    try {
      const r = await window.surge.surge.run("traffic");
      set({ traffic: parseTraffic(r.stdout) });
    } catch {
      /* traffic polling is best-effort */
    }
  },

  async selectPolicy(group, member) {
    await guarded(set, async () => {
      await window.surge.surge.run("selectPolicy", [group, member]);
      await get().refreshPolicies();
    });
  },

  async power(action) {
    await guarded(set, async () => {
      await window.surge.surge.run(action);
      await get().refreshStatus();
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

async function guarded(set: SetFn, fn: () => Promise<void>): Promise<void> {
  set({ busy: true, lastError: null });
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
