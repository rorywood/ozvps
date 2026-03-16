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
// Pure-JS DES implementation for VNC RFB authentication.
// Node.js 17+ with OpenSSL 3 removed DES from the default provider, so
// crypto.createCipheriv('des-ecb', ...) throws "unsupported". We implement
// the subset of DES needed by RFB type-2 auth (ECB mode, encrypt only).
// ---------------------------------------------------------------------------

const _DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const _DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const _DES_IP  = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const _DES_IP2 = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const _DES_E   = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const _DES_P   = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const _DES_S   = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];
const _DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function _desPerm(src: number[], tbl: number[]): number[] { return tbl.map(b => src[b-1]); }
function _desRotL(b: number[], n: number): number[] { return [...b.slice(n), ...b.slice(0, n)]; }
function _desXor(a: number[], b: number[]): number[] { return a.map((v,i) => v ^ b[i]); }
function _desBytesToBits(buf: Buffer | Uint8Array): number[] {
  const r: number[] = [];
  for (const byte of buf) for (let i = 7; i >= 0; i--) r.push((byte >> i) & 1);
  return r;
}
function _desBitsToBuffer(bits: number[]): Buffer {
  const buf = Buffer.alloc(bits.length >> 3);
  for (let i = 0; i < buf.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    buf[i] = v;
  }
  return buf;
}
function _desKeySchedule(key: Buffer): number[][] {
  const cd = _desPerm(_desBytesToBits(key), _DES_PC1);
  let c = cd.slice(0, 28), d = cd.slice(28);
  return _DES_SHIFTS.map(s => { c = _desRotL(c, s); d = _desRotL(d, s); return _desPerm([...c, ...d], _DES_PC2); });
}
function _desEncryptBlock(block: Buffer, sk: number[][]): Buffer {
  const bits = _desPerm(_desBytesToBits(block), _DES_IP);
  let l = bits.slice(0, 32), r = bits.slice(32);
  for (let i = 0; i < 16; i++) {
    const x = _desXor(_desPerm(r, _DES_E), sk[i]);
    const s: number[] = [];
    for (let b = 0; b < 8; b++) {
      const c = x.slice(b*6, b*6+6);
      const row = (c[0] << 1) | c[5];
      const col = (c[1] << 3) | (c[2] << 2) | (c[3] << 1) | c[4];
      const v = _DES_S[b][row * 16 + col];
      for (let k = 3; k >= 0; k--) s.push((v >> k) & 1);
    }
    const nr = _desXor(l, _desPerm(s, _DES_P));
    l = r; r = nr;
  }
  return _desBitsToBuffer(_desPerm([...r, ...l], _DES_IP2));
}
function _desEncryptEcb(data: Buffer, key: Buffer): Buffer {
  const sk = _desKeySchedule(key);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 8) _desEncryptBlock(data.slice(i, i + 8), sk).copy(out, i);
  return out;
}

// ---------------------------------------------------------------------------
// RFB / VNC authentication helpers
// ---------------------------------------------------------------------------

function makeVncDesKey(password: string): Buffer {
  const key = Buffer.alloc(8, 0);
  for (let i = 0; i < 8 && i < password.length; i++) {
    let byte = password.charCodeAt(i) & 0xff;
    let reversed = 0;
    for (let b = 0; b < 8; b++) reversed |= ((byte >> b) & 1) << (7 - b);
    key[i] = reversed;
  }
  return key;
}

function vncEncryptChallenge(challenge: Buffer, password: string): Buffer {
  return _desEncryptEcb(challenge, makeVncDesKey(password));
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
