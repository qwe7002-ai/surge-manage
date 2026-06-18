import { WifiOff } from "lucide-react";

export function Disconnected({ hint }: { hint?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <WifiOff className="h-8 w-8 opacity-50" />
      <p className="text-sm">Not connected to a host.</p>
      {hint && <p className="max-w-xs text-xs opacity-70">{hint}</p>}
    </div>
  );
}
