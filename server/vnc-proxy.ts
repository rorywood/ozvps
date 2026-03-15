/**
 * OzVPS VNC WebSocket Proxy
 *
 * Proxies the VNC console WebSocket connection between noVNC (browser) and
 * VirtFusion's websockify. Critically, the VNC authentication (RFB protocol
 * type 2 DES challenge-response) is handled entirely server-side using the
 * stored password — the browser never receives or needs the password.
 *
 * noVNC is presented with "None" security (type 1) — no password required.
 * The server handles VirtFusion auth, then passes all subsequent RFB bytes
 * through unmodified.
 */

import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { log } from './log';

// Short-lived proxy sessions: opaque token → VirtFusion credentials
// Browser only ever sees the token (embedded in WebSocket path), never the password.
export const vncProxySessions = new Map<string, {
  wsUrl: string;
  password: string;
  auth0UserId: string;
  serverId: string;
  expiresAt: number;
}>();

// Clean up any expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of vncProxySessions) {
    if (now > s.expiresAt) vncProxySessions.delete(token);
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// RFB / VNC authentication helpers
// ---------------------------------------------------------------------------

/**
 * Prepare an 8-byte DES key from the VNC password.
 * VNC's DES variant reverses the bit order within each byte.
 */
function makeVncDesKey(password: string): Buffer {
  const key = Buffer.alloc(8, 0);
  for (let i = 0; i < 8 && i < password.length; i++) {
    let byte = password.charCodeAt(i) & 0xff;
    let reversed = 0;
    for (let b = 0; b < 8; b++) {
      reversed |= ((byte >> b) & 1) << (7 - b);
    }
    key[i] = reversed;
  }
  return key;
}

/** Encrypt a 16-byte VNC challenge with the password using DES-ECB. */
function vncEncryptChallenge(challenge: Buffer, password: string): Buffer {
  const key = makeVncDesKey(password);
  const cipher = crypto.createCipheriv('des-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(challenge), cipher.final()]);
}

// ---------------------------------------------------------------------------
// Buffered async reader for WebSocket data
// ---------------------------------------------------------------------------
// WebSocket messages are variable-length, but RFB expects exact byte counts.
// This reader buffers incoming data and lets us await exactly N bytes.

function createReader(ws: WebSocket) {
  let buf = Buffer.alloc(0);
  const waiters: Array<{ n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void }> = [];
  let closed = false;
  let closeErr = new Error('WebSocket closed');

  function drain() {
    while (waiters.length > 0) {
      const w = waiters[0];
      if (buf.length >= w.n) {
        waiters.shift();
        w.resolve(buf.subarray(0, w.n));
        buf = buf.subarray(w.n);
      } else if (closed) {
        waiters.shift();
        w.reject(closeErr);
      } else {
        break;
      }
    }
  }

  const onMessage = (data: Buffer | string) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'base64');
    buf = Buffer.concat([buf, chunk]);
    drain();
  };

  ws.on('message', onMessage);
  ws.on('close', () => { closed = true; drain(); });
  ws.on('error', (err) => { closed = true; closeErr = err; drain(); });

  return {
    read(n: number): Promise<Buffer> {
      return new Promise((resolve, reject) => {
        waiters.push({ n, resolve, reject });
        drain();
      });
    },
    /** Stop buffering and return any unread data (call before switching to direct proxy). */
    stop(): Buffer {
      ws.off('message', onMessage);
      const remaining = buf;
      buf = Buffer.alloc(0);
      return remaining;
    },
  };
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

/**
 * Handle an HTTP upgrade request for /api/vnc-ws/:token.
 * Returns true if the request was handled (whether successfully or not),
 * false if the URL does not match our pattern.
 */
export async function handleVncUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://localhost');
  const match = url.pathname.match(/^\/api\/vnc-ws\/([a-f0-9]{64})$/);
  if (!match) return false;

  const token = match[1];
  const session = vncProxySessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    vncProxySessions.delete(token);
    socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return true;
  }

  // One-time use — delete immediately so the token can't be replayed
  vncProxySessions.delete(token);

  const { wsUrl, password, serverId } = session;

  const wss = new WebSocketServer({ noServer: true });
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    doProxy(clientWs, wsUrl, password, serverId);
  });

  return true;
}

/** Main proxy logic, runs after the client WebSocket upgrade is accepted. */
async function doProxy(
  clientWs: WebSocket,
  wsUrl: string,
  password: string,
  serverId: string,
): Promise<void> {
  // Connect to VirtFusion's websockify immediately.
  // Create the reader BEFORE open fires so no messages are missed.
  const serverWs = new WebSocket(wsUrl);
  const serverReader = createReader(serverWs);
  const clientReader = createReader(clientWs);

  const cleanup = (reason?: string) => {
    if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(1011, reason || 'Console ended');
    if (serverWs.readyState !== WebSocket.CLOSED) serverWs.close();
  };

  clientWs.on('error', () => cleanup());
  serverWs.on('error', (err) => {
    log(`VNC proxy server error (server ${serverId}): ${err.message}`, 'vnc');
    cleanup('VNC server connection failed');
  });

  try {
    // Wait for the VirtFusion WebSocket to open
    await new Promise<void>((resolve, reject) => {
      serverWs.once('open', resolve);
      serverWs.once('error', reject);
    });

    // -------------------------------------------------------------------------
    // Phase 1: Authenticate with VirtFusion (server side)
    // -------------------------------------------------------------------------

    // Version handshake — accept whatever version VirtFusion sends, respond with 3.8
    const serverVersionBuf = await serverReader.read(12);
    const serverVersionStr = serverVersionBuf.toString('ascii');
    const isRfb33 = serverVersionStr.startsWith('RFB 003.003');
    serverWs.send('RFB 003.008\n');

    let chosenSecType: number;

    if (isRfb33) {
      // RFB 3.3: server dictates security type (4 bytes), no client selection
      const secType = (await serverReader.read(4)).readUInt32BE(0);
      if (secType === 0) {
        const errLen = (await serverReader.read(4)).readUInt32BE(0);
        const errMsg = (await serverReader.read(errLen)).toString('utf8');
        throw new Error(`VirtFusion refused: ${errMsg}`);
      }
      chosenSecType = secType;
    } else {
      // RFB 3.7/3.8: server sends [count, type1, type2, ...]
      const secCount = (await serverReader.read(1))[0];
      if (secCount === 0) {
        const errLen = (await serverReader.read(4)).readUInt32BE(0);
        const errMsg = (await serverReader.read(errLen)).toString('utf8');
        throw new Error(`VirtFusion refused: ${errMsg}`);
      }
      const secTypes = await serverReader.read(secCount);

      // Prefer VNC auth (type 2) if available
      chosenSecType = 1;
      for (let i = 0; i < secCount; i++) {
        if (secTypes[i] === 2) { chosenSecType = 2; break; }
      }
      serverWs.send(Buffer.from([chosenSecType]));
    }

    if (chosenSecType === 2) {
      // VNC Authentication: DES challenge-response
      const challenge = await serverReader.read(16);
      serverWs.send(vncEncryptChallenge(challenge, password));
    }
    // type 1 (None): no auth needed

    // Security result (only in RFB 3.8, or 3.3 with VNC auth)
    if (!isRfb33 || chosenSecType === 2) {
      const result = await serverReader.read(4);
      if (result.readUInt32BE(0) !== 0) {
        // RFB 3.8 includes a reason string on failure
        try {
          const errLen = (await serverReader.read(4)).readUInt32BE(0);
          const errMsg = (await serverReader.read(errLen)).toString('utf8');
          throw new Error(`VNC auth failed: ${errMsg}`);
        } catch {
          throw new Error('VNC authentication failed');
        }
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Negotiate with noVNC (client side) — present "None" auth
    // -------------------------------------------------------------------------

    // Send RFB version to noVNC
    clientWs.send('RFB 003.008\n');
    await clientReader.read(12); // client's version response

    // Offer only security type 1 (None) — no password required
    clientWs.send(Buffer.from([0x01, 0x01]));  // count=1, type=1
    await clientReader.read(1);                 // client selects type 1

    // Security result: OK
    clientWs.send(Buffer.from([0x00, 0x00, 0x00, 0x00]));

    // -------------------------------------------------------------------------
    // Phase 3: Bidirectional proxy — pass all RFB bytes through unchanged
    // -------------------------------------------------------------------------

    // Stop buffering; flush any data that accumulated during the handshake
    const serverLeftover = serverReader.stop();
    const clientLeftover = clientReader.stop();

    if (serverLeftover.length > 0 && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(serverLeftover);
    }
    if (clientLeftover.length > 0 && serverWs.readyState === WebSocket.OPEN) {
      serverWs.send(clientLeftover);
    }

    // Direct proxy for all subsequent messages
    serverWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data as Buffer);
    });
    clientWs.on('message', (data) => {
      if (serverWs.readyState === WebSocket.OPEN) serverWs.send(data as Buffer);
    });

    serverWs.on('close', () => { if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(); });
    clientWs.on('close', () => { if (serverWs.readyState !== WebSocket.CLOSED) serverWs.close(); });

    log(`VNC proxy active for server ${serverId}`, 'security');

  } catch (err: any) {
    log(`VNC proxy auth failed for server ${serverId}: ${err.message}`, 'vnc');
    cleanup('Console connection failed. Please try again.');
  }
}
