import { useState } from "react";
import { Plug, PlugZap, Plus, Server, Trash2 } from "lucide-react";
import type { HostConfig } from "@surge-manage/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";
import { HostDialog } from "@/components/HostDialog";

export function Sidebar() {
  const hosts = useApp((s) => s.hosts);
  const selectedHostId = useApp((s) => s.selectedHostId);
  const connection = useApp((s) => s.connection);
  const selectHost = useApp((s) => s.selectHost);
  const connect = useApp((s) => s.connect);
  const disconnect = useApp((s) => s.disconnect);
  const removeHost = useApp((s) => s.removeHost);

  const [editing, setEditing] = useState<HostConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const connectedId =
    connection.phase === "connected" ? connection.hostId : undefined;
  const busyPhase =
    connection.phase === "sshConnecting" || connection.phase === "moshBootstrapping";

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(host: HostConfig) {
    setEditing(host);
    setDialogOpen(true);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card/40">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Hosts
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={openNew}>
          <Plus />
        </Button>
      </div>

      <div className="flex-1 space-y-1 overflow-auto px-2">
        {hosts.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No hosts yet. Add a Surge server to begin.
          </p>
        )}
        {hosts.map((host) => {
          const isSelected = host.id === selectedHostId;
          const isConnected = host.id === connectedId;
          return (
            <div
              key={host.id}
              onClick={() => selectHost(host.id)}
              className={cn(
                "group cursor-pointer rounded-md border border-transparent px-2.5 py-2 transition-colors",
                isSelected ? "border-border bg-accent" : "hover:bg-accent/50",
              )}
            >
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{host.label}</span>
                {isConnected && (
                  <Badge variant="success" className="ml-auto h-4 px-1.5 text-[10px]">
                    live
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
                {host.username}@{host.host}:{host.port}
              </div>
              {isSelected && (
                <div className="mt-2 flex items-center gap-1.5 pl-6">
                  {isConnected ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        void disconnect();
                      }}
                    >
                      <Plug /> Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 flex-1"
                      disabled={busyPhase}
                      onClick={(e) => {
                        e.stopPropagation();
                        void connect(host.id);
                      }}
                    >
                      <PlugZap /> {busyPhase ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(host);
                    }}
                  >
                    <Server className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeHost(host.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <HostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
      />
    </aside>
  );
}
