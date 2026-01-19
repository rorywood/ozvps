import { WebSocketServer, WebSocket } from "ws";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { validateAdminSession } from "../middleware/admin-auth";

interface AuthenticatedWebSocket extends WebSocket {
  isAlive: boolean;
  sessionId?: string;
  email?: string;
}

// PM2 process names to stream logs from
const PM2_PROCESSES = ["ozvps", "ozvps-admin"];

let pm2LogProcess: ChildProcessWithoutNullStreams | null = null;

export function setupLogWebSocket(wss: WebSocketServer) {
  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedWebSocket;
      if (socket.isAlive === false) {
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
    if (pm2LogProcess) {
      pm2LogProcess.kill();
      pm2LogProcess = null;
    }
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const socket = ws as AuthenticatedWebSocket;
    socket.isAlive = true;

    // Authenticate the connection
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
    const sessionId = cookies["admin_session"];

    if (!sessionId) {
      socket.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
      socket.close(4001, "Not authenticated");
      return;
    }

    // Get client IP from headers (nginx sets these)
    const forwardedFor = req.headers["x-forwarded-for"];
    const realIp = req.headers["x-real-ip"];
    let clientIp = "unknown";

    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      clientIp = ips.split(",")[0].trim();
    } else if (realIp) {
      clientIp = Array.isArray(realIp) ? realIp[0] : realIp;
    } else if (req.socket.remoteAddress) {
      clientIp = req.socket.remoteAddress.replace(/^::ffff:/, "");
    }

    const session = await validateAdminSession(sessionId, clientIp);

    if (!session) {
      socket.send(JSON.stringify({ type: "error", message: "Session invalid" }));
      socket.close(4001, "Session invalid");
      return;
    }

    socket.sessionId = sessionId;
    socket.email = session.email;

    console.log(`[ws-logs] Admin ${session.email} connected to log stream`);

    socket.send(JSON.stringify({
      type: "connected",
      message: `Connected to log stream for: ${PM2_PROCESSES.join(", ")}`,
    }));

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("close", () => {
      console.log(`[ws-logs] Admin ${socket.email} disconnected from log stream`);
    });

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle commands from client
        if (message.type === "filter") {
          // Client can filter to specific process
          socket.send(JSON.stringify({
            type: "info",
            message: `Filter set to: ${message.process || "all"}`,
          }));
        }
      } catch {
        // Ignore invalid messages
      }
    });
  });

  // Start PM2 log streaming if there are connected clients
  startLogStreaming(wss);
}

function startLogStreaming(wss: WebSocketServer) {
  // Check if PM2 is available
  const checkPm2 = spawn("pm2", ["--version"], { shell: true });

  checkPm2.on("error", () => {
    console.log("[ws-logs] PM2 not available, log streaming disabled");
    return;
  });

  checkPm2.on("close", (code) => {
    if (code !== 0) {
      console.log("[ws-logs] PM2 not available, log streaming disabled");
      return;
    }

    // PM2 is available, start log streaming
    streamLogs(wss);
  });
}

function streamLogs(wss: WebSocketServer) {
  // Kill existing process if any
  if (pm2LogProcess) {
    pm2LogProcess.kill();
  }

  // Start PM2 logs with all processes
  pm2LogProcess = spawn("pm2", ["logs", "--raw", "--lines", "0"], {
    shell: true,
  });

  pm2LogProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      broadcastLog(wss, line, "stdout");
    });
  });

  pm2LogProcess.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      broadcastLog(wss, line, "stderr");
    });
  });

  pm2LogProcess.on("close", (code) => {
    console.log(`[ws-logs] PM2 logs process exited with code ${code}`);

    // Restart after a delay if there are still connected clients
    setTimeout(() => {
      if (wss.clients.size > 0) {
        console.log("[ws-logs] Restarting PM2 log stream...");
        streamLogs(wss);
      }
    }, 5000);
  });

  pm2LogProcess.on("error", (error) => {
    console.log(`[ws-logs] PM2 logs error: ${error.message}`);
  });

  console.log("[ws-logs] PM2 log streaming started");
}

function broadcastLog(wss: WebSocketServer, line: string, stream: "stdout" | "stderr") {
  const message = JSON.stringify({
    type: "log",
    stream,
    line,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
