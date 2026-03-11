import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Circle } from "lucide-react";

interface BackendStatus {
  server: {
    name: string;
    port: number;
    environment: string;
    status: string;
  };
  redis: {
    url: string;
    connected: boolean;
    status: string;
  };
  frontend: {
    url: string;
  };
  connections: {
    socketClients: number;
  };
}

export function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
        console.log("Backend URL:", backendUrl);
        const response = await fetch(`${backendUrl}/api/status`);

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();
        setStatus(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch backend status"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Refresh status every 5 seconds
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-svh flex-col gap-8 p-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold">Sketch Frenzy</h1>
        <p className="text-muted-foreground mt-2">
          Connected Services Status
        </p>
      </div>

      {loading ? (
        <div className="max-w-2xl rounded-lg border border-muted bg-muted/50 p-6">
          <p className="text-sm text-muted-foreground">
            Loading services status...
          </p>
        </div>
      ) : error ? (
        <div className="max-w-2xl rounded-lg border border-destructive bg-destructive/10 p-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        </div>
      ) : status ? (
        <div className="max-w-2xl space-y-4">
          {/* Backend Service */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <h2 className="font-semibold">{status.server.name}</h2>
                  <p className="text-sm text-muted-foreground">Backend API</p>
                </div>
              </div>
              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700">
                {status.server.status}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">URL:</span>
                <span className="text-foreground">
                  http://localhost:{status.server.port}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Environment:</span>
                <span className="text-foreground">{status.server.environment}</span>
              </div>
            </div>
          </div>

          {/* Redis Service */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {status.redis.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <h2 className="font-semibold">Redis Cache</h2>
                  <p className="text-sm text-muted-foreground">Session Storage</p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  status.redis.connected
                    ? "bg-green-500/10 text-green-700"
                    : "bg-yellow-500/10 text-yellow-700"
                }`}
              >
                {status.redis.status}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">URL:</span>
                <span className="text-foreground">{status.redis.url}</span>
              </div>
            </div>
          </div>

          {/* Frontend Service */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <h2 className="font-semibold">Frontend</h2>
                  <p className="text-sm text-muted-foreground">React App</p>
                </div>
              </div>
              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700">
                running
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">URL:</span>
                <span className="text-foreground">{status.frontend.url}</span>
              </div>
            </div>
          </div>

          {/* Active Connections */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <Circle className="h-5 w-5 text-blue-500" />
              <div>
                <h2 className="font-semibold">Active Connections</h2>
                <p className="text-sm text-muted-foreground">WebSocket Clients</p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Connected Clients:</span>
                <span className="font-semibold">{status.connections.socketClients}</span>
              </div>
            </div>
          </div>

          <Button className="mt-2" onClick={() => window.location.reload()}>
            Refresh Status
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
