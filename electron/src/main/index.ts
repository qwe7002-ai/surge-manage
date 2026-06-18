import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { IPC, type HostConfig, type SurgeAction } from "@surge-manage/shared";
import { ConnectionManager } from "./connection";
import { listHosts, removeHost, saveHost } from "./store";
import { setSecret } from "./secrets";

const isDev = !!process.env["ELECTRON_RENDERER_URL"];
const connection = new ConnectionManager();
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses Node built-ins via the typed bridge
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]!);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

// Forward connection events to the renderer. Note: no raw terminal stream is
// ever forwarded — only connection state and parsed log lines.
connection.on("state", (s) => send(IPC.connState, s));
connection.on("log", (l) => send(IPC.logLine, l));

function registerIpc(): void {
  ipcMain.handle(IPC.hostsList, () => listHosts());
  ipcMain.handle(IPC.hostsSave, (_e, host: HostConfig) => saveHost(host));
  ipcMain.handle(IPC.hostsRemove, (_e, id: string) => removeHost(id));
  ipcMain.handle(IPC.hostsSetSecret, (_e, ref: string, value: string) =>
    setSecret(ref, value),
  );

  ipcMain.handle(IPC.connConnect, async (_e, hostId: string) => {
    const host = (await listHosts()).find((h) => h.id === hostId);
    if (!host) throw new Error(`Unknown host: ${hostId}`);
    await connection.connect(host);
  });
  ipcMain.handle(IPC.connDisconnect, () => connection.disconnect());

  ipcMain.handle(
    IPC.surgeRun,
    (_e, action: SurgeAction, args: string[] = []) => connection.run(action, args),
  );

  ipcMain.handle(IPC.logsStart, () => connection.startLogs());
  ipcMain.handle(IPC.logsStop, () => connection.stopLogs());
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  connection.disconnect();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => connection.disconnect());
