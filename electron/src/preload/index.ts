import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type ConnectionState,
  type HostConfig,
  type CommandResult,
  type LogLine,
  type SurgeAction,
  type SurgeBridge,
} from "@surge-manage/shared";

/**
 * The only surface the renderer can touch. Everything is funnelled through
 * allow-listed channels; the renderer never sees `ipcRenderer` or Node APIs.
 */
const bridge: SurgeBridge = {
  hosts: {
    list: () => ipcRenderer.invoke(IPC.hostsList),
    save: (host: HostConfig) => ipcRenderer.invoke(IPC.hostsSave, host),
    remove: (id: string) => ipcRenderer.invoke(IPC.hostsRemove, id),
    setSecret: (ref: string, value: string) =>
      ipcRenderer.invoke(IPC.hostsSetSecret, ref, value),
  },
  connection: {
    connect: (hostId: string) => ipcRenderer.invoke(IPC.connConnect, hostId),
    disconnect: () => ipcRenderer.invoke(IPC.connDisconnect),
    onState: (cb: (state: ConnectionState) => void) => {
      const handler = (_e: unknown, s: ConnectionState) => cb(s);
      ipcRenderer.on(IPC.connState, handler);
      return () => ipcRenderer.removeListener(IPC.connState, handler);
    },
  },
  surge: {
    run: (action: SurgeAction, args?: string[]): Promise<CommandResult> =>
      ipcRenderer.invoke(IPC.surgeRun, action, args ?? []),
  },
  logs: {
    start: () => ipcRenderer.invoke(IPC.logsStart),
    stop: () => ipcRenderer.invoke(IPC.logsStop),
    onLine: (cb: (line: LogLine) => void) => {
      const handler = (_e: unknown, l: LogLine) => cb(l);
      ipcRenderer.on(IPC.logLine, handler);
      return () => ipcRenderer.removeListener(IPC.logLine, handler);
    },
  },
};

contextBridge.exposeInMainWorld("surge", bridge);
