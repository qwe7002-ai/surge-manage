import { useEffect, useRef } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import type { LogLine } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disconnected } from "@/components/Disconnected";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

const LEVEL_COLOR: Record<LogLine["level"], string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  notify: "text-sky-400",
  warning: "text-amber-400",
  error: "text-destructive",
  unknown: "text-muted-foreground",
};

export function LogsPanel() {
  const connected = useApp((s) => s.connection.phase === "connected");
  const logs = useApp((s) => s.logs);
  const streaming = useApp((s) => s.logStreaming);
  const startLogs = useApp((s) => s.startLogs);
  const stopLogs = useApp((s) => s.stopLogs);
  const clearLogs = useApp((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stream while this panel is mounted (Logs tab open); stop on unmount.
  useEffect(() => {
    if (!connected) return;
    void startLogs();
    return () => void stopLogs();
  }, [connected, startLogs, stopLogs]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  if (!connected) return <Disconnected />;

  return (
    <div className="flex h-full flex-col space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={streaming ? "success" : "secondary"}>
          {streaming ? "Streaming" : "Paused"}
        </Badge>
        <span className="text-xs text-muted-foreground">{logs.length} lines</span>
        <div className="ml-auto flex gap-1.5">
          {streaming ? (
            <Button size="sm" variant="ghost" onClick={() => void stopLogs()}>
              <Pause /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void startLogs()}>
              <Play /> Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearLogs}>
            <Trash2 /> Clear
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-muted-foreground">Waiting for requests…</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-all", LEVEL_COLOR[line.level])}>
              {line.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
