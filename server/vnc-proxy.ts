/**
 * OzVPS VNC WebSocket Proxy
 *
 * Proxies the VNC console WebSocket connection between noVNC (browser) and
 * VirtFusion's websockify. VNC authentication (RFB type 2 DES challenge-response)
 * is handled entirely server-side — the browser never receives the password.
 *
 * noVNC is presented with "None" security (type 1) — no password required.
 */

import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { log } from './log';

// Short-lived proxy sessions: opaque token → VirtFusion credentials
export const vncProxySessions = new Map<string, {
  wsUrl: string;
  password: string;
  auth0UserId: string;
  serverId: string;
  expiresAt: number;
}>();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of vncProxySessions) {
    if (now > s.expiresAt) vncProxySessions.delete(token);
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// RFB / VNC authentication helpers
// ---------------------------------------------------------------------------

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

function vncEncryptChallenge(challenge: Buffer, password: string): Buffer {
  const key = makeVncDesKey(password);
  const cipher = crypto.createCipheriv('des-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(challenge), cipher.final()]);
}

// ---------------------------------------------------------------------------
// Buffered async reader for WebSocket data
// ---------------------------------------------------------------------------

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
    // Handle both binary frames (Buffer) and base64 text frames (legacy websockify)
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

export async function handleVncUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://localhost');
  const match = url.pathname.match(/^\/api\/vnc-ws\/([a-f0-9]{64})$/);
  if (!match) return false;

  const token = match[1];
  log(`VNC upgrade: token=${token.slice(0, 8)}...`, 'vnc');

  const session = vncProxySessions.get(token);

  if (!session) {
    log(`VNC upgrade: token not found (already used or expired)`, 'vnc');
    socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return true;
  }

  if (Date.now() > session.expiresAt) {
    log(`VNC upgrade: token expired for server ${session.serverId}`, 'vnc');
    vncProxySessions.delete(token);
    socket.write('HTTP/1.1 410 Gone\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return true;
  }

  // One-time use
  vncProxySessions.delete(token);
  const { wsUrl, password, serverId } = session;
  log(`VNC upgrade: accepted for server ${serverId}, connecting to VirtFusion...`, 'vnc');

  const wss = new WebSocketServer({ noServer: true });
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    doProxy(clientWs, wsUrl, password, serverId);
  });

  return true;
}

/** Main proxy logic — called after the browser WebSocket upgrade is accepted. */
async function doProxy(
  clientWs: WebSocket,
  wsUrl: string,
  password: string,
  serverId: string,
): Promise<void> {
  let done = false;
  const cleanup = (reason?: string) => {
    if (done) return;
    done = true;
    if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(1011, reason || 'Console ended');
    if (serverWs.readyState !== WebSocket.CLOSED) serverWs.close();
  };

  // Connect to VirtFusion's websockify.
  // Must specify 'binary' subprotocol — websockify requires this to send/receive raw binary frames.
  // Without it, websockify closes the connection immediately (policy violation).
  // Create reader BEFORE open fires so no messages are missed.
  const serverWs = new WebSocket(wsUrl, ['binary']);
  const serverReader = createReader(serverWs);
  const clientReader = createReader(clientWs);

  serverWs.on('error', (err) => {
    if (!done) log(`VNC proxy: VirtFusion error for server ${serverId}: ${err.message}`, 'vnc');
    cleanup('VNC server connection failed');
  });
  clientWs.on('error', () => cleanup());

  try {
    // Wait for VirtFusion WebSocket to open
    await new Promise<void>((resolve, reject) => {
      serverWs.once('open', resolve);
      serverWs.once('error', reject);
    });
    log(`VNC proxy: connected to VirtFusion for server ${serverId}`, 'vnc');

    // -----------------------------------------------------------------------
    // Phase 1: Authenticate with VirtFusion server-side
    // -----------------------------------------------------------------------

    // Version handshake — ALL data sent as binary Buffers (never strings)
    const serverVersionBuf = await serverReader.read(12);
    const serverVersionStr = serverVersionBuf.toString('ascii').trim();
    log(`VNC proxy: VirtFusion RFB version: ${serverVersionStr}`, 'vnc');

    const isRfb33 = serverVersionStr === 'RFB 003.003';
    serverWs.send(Buffer.from('RFB 003.008\n'));

    let chosenSecType: number;

    if (isRfb33) {
      // RFB 3.3: server sends 4-byte security type directly
      const secTypeBuf = await serverReader.read(4);
      const secType = secTypeBuf.readUInt32BE(0);
      log(`VNC proxy: RFB 3.3 security type: ${secType}`, 'vnc');
      if (secType === 0) {
        const errLen = (await serverReader.read(4)).readUInt32BE(0);
        const errMsg = errLen > 0 ? (await serverReader.read(errLen)).toString('utf8') : 'unknown';
        throw new Error(`VirtFusion refused connection: ${errMsg}`);
      }
      chosenSecType = secType;
      // RFB 3.3: no security type selection from client
    } else {
      // RFB 3.7/3.8: server sends [count, type1, type2, ...]
      const secCount = (await serverReader.read(1))[0];
      log(`VNC proxy: RFB 3.8 security types count: ${secCount}`, 'vnc');
      if (secCount === 0) {
        const errLen = (await serverReader.read(4)).readUInt32BE(0);
        const errMsg = errLen > 0 ? (await serverReader.read(errLen)).toString('utf8') : 'unknown';
        throw new Error(`VirtFusion refused connection: ${errMsg}`);
      }
      const secTypes = await serverReader.read(secCount);
      log(`VNC proxy: security types offered: [${Array.from(secTypes).join(',')}]`, 'vnc');

      // Prefer VNC auth (type 2), fall back to None (type 1)
      chosenSecType = 1;
      for (let i = 0; i < secCount; i++) {
        if (secTypes[i] === 2) { chosenSecType = 2; break; }
      }
      log(`VNC proxy: selecting security type ${chosenSecType}`, 'vnc');
      serverWs.send(Buffer.from([chosenSecType]));
    }

    if (chosenSecType === 2) {
      // VNC Authentication: DES challenge-response
      const challenge = await serverReader.read(16);
      log(`VNC proxy: received VNC auth challenge, responding with DES...`, 'vnc');
      serverWs.send(vncEncryptChallenge(challenge, password));
    }

    // Security result for RFB 3.8+ (and RFB 3.3 with VNC auth)
    if (!isRfb33 || chosenSecType === 2) {
      const result = await serverReader.read(4);
      const resultCode = result.readUInt32BE(0);
      if (resultCode !== 0) {
        let errMsg = `code ${resultCode}`;
        try {
          const errLen = (await serverReader.read(4)).readUInt32BE(0);
          if (errLen > 0 && errLen < 1024) {
            errMsg = (await serverReader.read(errLen)).toString('utf8');
          }
        } catch {}
        throw new Error(`VNC auth failed: ${errMsg}`);
      }
      log(`VNC proxy: VirtFusion auth successful`, 'vnc');
    }

    // -----------------------------------------------------------------------
    // Phase 2: Negotiate with noVNC — present "None" auth (no password needed)
    // -----------------------------------------------------------------------
    log(`VNC proxy: starting client negotiation for server ${serverId}`, 'vnc');

    clientWs.send(Buffer.from('RFB 003.008\n'));
    const clientVersionBuf = await clientReader.read(12);
    log(`VNC proxy: noVNC sent version: ${clientVersionBuf.toString('ascii').trim()}`, 'vnc');

    // Offer only security type 1 (None)
    clientWs.send(Buffer.from([0x01, 0x01]));   // count=1, type=1 (None)
    const clientChoice = await clientReader.read(1);
    log(`VNC proxy: noVNC selected security type: ${clientChoice[0]}`, 'vnc');

    // Security result: OK
    clientWs.send(Buffer.from([0x00, 0x00, 0x00, 0x00]));

    // -----------------------------------------------------------------------
    // Phase 3: Bidirectional proxy
    // -----------------------------------------------------------------------
    const serverLeftover = serverReader.stop();
    const clientLeftover = clientReader.stop();

    if (serverLeftover.length > 0 && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(serverLeftover);
    }
    if (clientLeftover.length > 0 && serverWs.readyState === WebSocket.OPEN) {
      serverWs.send(clientLeftover);
    }

    serverWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data as Buffer, { binary: isBinary });
    });
    clientWs.on('message', (data, isBinary) => {
      if (serverWs.readyState === WebSocket.OPEN) serverWs.send(data as Buffer, { binary: isBinary });
    });

    serverWs.on('close', () => cleanup());
    clientWs.on('close', () => cleanup());

    log(`VNC proxy ACTIVE for server ${serverId}`, 'security');

  } catch (err: any) {
    log(`VNC proxy FAILED for server ${serverId}: ${err.message}`, 'vnc');
    cleanup('Console connection failed. Please try again.');
  }
}
