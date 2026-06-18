import { AlertCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import type { ConnectionPhase } from "@surge-manage/shared";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<ConnectionPhase, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Error",
};

export function StatusBar() {
  const connection = useApp((s) => s.connection);
  const lastError = useApp((s) => s.lastError);
  const busy = useApp((s) => s.busy);

  const phase = connection.phase;
  const inProgress = phase === "connecting";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t bg-card/40 px-3 text-xs text-muted-foreground">
      <PhaseIcon phase={phase} />
      <span
        className={cn(
          phase === "connected" && "text-emerald-500",
          phase === "error" && "text-destructive",
        )}
      >
        {PHASE_LABEL[phase]}
      </span>
      {connection.latencyMs != null && phase === "connected" && (
        <span className="text-muted-foreground">· {connection.latencyMs} ms</span>
      )}
      <div className="ml-auto flex items-center gap-3">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {(phase === "error" || lastError) && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {connection.error ?? lastError}
          </span>
        )}
      </div>
      {inProgress && <Loader2 className="h-3 w-3 animate-spin" />}
    </footer>
  );
}

function PhaseIcon({ phase }: { phase: ConnectionPhase }) {
  if (phase === "connected") return <Wifi className="h-3.5 w-3.5 text-emerald-500" />;
  if (phase === "error") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (phase === "connecting")
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  return <WifiOff className="h-3.5 w-3.5" />;
}
