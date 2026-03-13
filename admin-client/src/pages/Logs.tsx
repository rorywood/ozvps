import { useState, useEffect, useRef } from "react";
import { Play, Pause, Trash2, Download } from "lucide-react";

interface LogEntry {
  type: string;
  stream: "stdout" | "stderr";
  line: string;
  timestamp: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLogs((prev) => [
        ...prev,
        { type: "info", stream: "stdout", line: "Connected to log stream", timestamp: new Date().toISOString() },
      ]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          setLogs((prev) => {
            const newLogs = [...prev, data];
            if (newLogs.length > 1000) {
              return newLogs.slice(-1000);
            }
            return newLogs;
          });
        } else if (data.type === "error") {
          setLogs((prev) => [
            ...prev,
            { type: "error", stream: "stderr", line: data.message, timestamp: new Date().toISOString() },
          ]);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setLogs((prev) => [
        ...prev,
        { type: "info", stream: "stdout", line: "Disconnected from log stream", timestamp: new Date().toISOString() },
      ]);
    };

    ws.onerror = () => {
      setLogs((prev) => [
        ...prev,
        { type: "error", stream: "stderr", line: "WebSocket error", timestamp: new Date().toISOString() },
      ]);
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!paused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, paused]);

  const filteredLogs = logs.filter((log) => {
    if (!filter) return true;
    return log.line.toLowerCase().includes(filter.toLowerCase());
  });

  const downloadLogs = () => {
    const content = filteredLogs.map((log) => `[${log.timestamp}] [${log.stream}] ${log.line}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozvps-logs-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
            connected
              ? "bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] border-[hsl(160_84%_39%)/30]"
              : "bg-[hsl(0_84%_60%)/20] text-[hsl(0_84%_70%)] border-[hsl(0_84%_60%)/30]"
          }`}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none w-48"
          />
          <button
            onClick={() => setPaused(!paused)}
            className={`p-2 rounded-lg transition-colors ${
              paused
                ? "bg-[hsl(160_84%_39%)/20] text-[hsl(160_84%_60%)] hover:bg-[hsl(160_84%_39%)/30]"
                : "bg-[hsl(14_100%_60%)/20] text-[hsl(14_100%_70%)] hover:bg-[hsl(14_100%_60%)/30]"
            }`}
            title={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setLogs([])}
            className="p-2 bg-white/5 border border-white/10 text-white/60 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={downloadLogs}
            className="p-2 bg-[hsl(210_100%_50%)/20] text-[hsl(210_100%_70%)] rounded-lg hover:bg-[hsl(210_100%_50%)/30] transition-colors"
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[hsl(216_28%_5%)] border border-white/8 rounded-xl overflow-hidden">
        <div className="h-full overflow-y-auto p-4 font-mono text-sm">
          {filteredLogs.map((log, i) => (
            <div
              key={i}
              className={`py-0.5 leading-relaxed ${
                log.stream === "stderr" || log.type === "error"
                  ? "text-[hsl(0_84%_70%)]"
                  : "text-[hsl(0_0%_80%)]"
              }`}
            >
              <span className="text-white/30">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{" "}
              {log.line}
            </div>
          ))}
          <div ref={logsEndRef} />
          {filteredLogs.length === 0 && (
            <div className="text-white/30 text-center py-8">
              {connected ? "Waiting for logs..." : "Not connected to log stream"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
