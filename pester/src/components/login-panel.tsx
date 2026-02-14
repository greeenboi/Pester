import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Titlebar } from "@/components/titlebar";
import type { ConnectionStatus } from "@/lib/use-pubsub";

interface LoginPanelProps {
  status: ConnectionStatus;
  onRegister: (userId: string) => void;
  error: string | null;
}

export function LoginPanel({ status, onRegister, error }: LoginPanelProps) {
  const [id, setId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = id.trim();
    if (trimmed) onRegister(trimmed);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Titlebar />
      <div className="flex flex-col items-center justify-center flex-1 px-6">
        <div className="w-full max-w-xs flex flex-col gap-5">
          <div className="text-center">
            <h1 className="text-lg font-semibold">Pester</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Volatile messaging — nothing stored.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userId" className="text-xs">Your ID</Label>
              <Input
                id="userId"
                placeholder="Enter a unique username…"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoFocus
                disabled={status === "connecting"}
                className="h-8 text-xs"
              />
            </div>
            {error && (
              <p className="text-[11px] text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={!id.trim() || status === "connecting"}
            >
              {status === "connecting" ? "Connecting…" : "Go Online"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
