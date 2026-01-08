import { useRef, useState, useEffect, useCallback } from "react";
import { VncScreen } from "react-vnc";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, 
  Maximize2, 
  Minimize2, 
  X, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Clipboard,
  Send,
  Copy,
  Monitor,
  Scan,
  Shrink
} from "lucide-react";

interface VncViewerProps {
  wsUrl: string;
  password: string;
  onDisconnect?: () => void;
  onClose?: () => void;
}

export function VncViewer({ wsUrl, password, onDisconnect, onClose }: VncViewerProps) {
  const vncRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [key, setKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const [nativeSize, setNativeSize] = useState(false);

  const handleConnect = useCallback(() => {
    setStatus('connected');
    forceCursorVisible();
  }, []);

  const forceCursorVisible = () => {
    const vncContainer = document.querySelector('[data-testid="vnc-screen"]');
    if (vncContainer) {
      const canvases = vncContainer.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        if (canvas.style.cursor === 'none' || !canvas.style.cursor) {
          canvas.style.setProperty('cursor', 'crosshair', 'important');
        }
      });
    }
  };

  useEffect(() => {
    const vncContainer = document.querySelector('[data-testid="vnc-screen"]');
    if (!vncContainer) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement;
          if (target.tagName === 'CANVAS' && target.style.cursor === 'none') {
            target.style.setProperty('cursor', 'crosshair', 'important');
          }
        }
      });
    });

    const canvases = vncContainer.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
      (canvas as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
    });

    const containerObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'CANVAS') {
            const canvas = node as HTMLCanvasElement;
            canvas.style.setProperty('cursor', 'crosshair', 'important');
            observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
          }
        });
      });
    });

    containerObserver.observe(vncContainer, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      containerObserver.disconnect();
    };
  }, [key, status]);

  const handleDisconnect = useCallback(() => {
    setStatus('disconnected');
    if (onDisconnect) onDisconnect();
  }, [onDisconnect]);

  const handleSecurityFailure = useCallback(() => {
    setStatus('error');
  }, []);

  const handleReconnect = () => {
    setStatus('connecting');
    setKey(prev => prev + 1);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const sendCtrlAltDel = () => {
    const rfb = vncRef.current?.rfb;
    if (rfb) {
      rfb.sendCtrlAltDel();
    }
  };

  const sendKey = (keysym: number, code: string) => {
    const rfb = vncRef.current?.rfb;
    if (rfb) {
      rfb.sendKey(keysym, code, true);
      rfb.sendKey(keysym, code, false);
    }
  };

  const SHIFT_CHARS = '~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SHIFT_KEYSYM = 0xFFE1;

  const getKeysymForChar = (char: string): number => {
    const code = char.charCodeAt(0);
    if (char === '\n' || char === '\r') return 0xFF0D;
    if (char === '\t') return 0xFF09;
    if (char === '\b') return 0xFF08;
    if (char === ' ') return 0x0020;
    if (code >= 32 && code <= 126) {
      return code;
    }
    return code;
  };

  const sendClipboardText = async () => {
    const rfb = vncRef.current?.rfb;
    if (!rfb || !clipboardText) return;

    for (const char of clipboardText) {
      const needsShift = SHIFT_CHARS.includes(char);
      const keysym = getKeysymForChar(char);

      if (needsShift) {
        rfb.sendKey(SHIFT_KEYSYM, 'ShiftLeft', true);
      }

      rfb.sendKey(keysym, null, true);
      rfb.sendKey(keysym, null, false);

      if (needsShift) {
        rfb.sendKey(SHIFT_KEYSYM, 'ShiftLeft', false);
      }

      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setClipboardText(text);
    } catch (e) {
      console.error('Failed to read clipboard:', e);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const forceInterval = setInterval(() => {
      forceCursorVisible();
    }, 500);
    forceCursorVisible();
    return () => clearInterval(forceInterval);
  }, [key]);

  return (
    <div ref={containerRef} className="flex h-full w-full bg-black">
      {/* Sidebar */}
      <div 
        className={`
          flex-shrink-0 bg-background/95 backdrop-blur border-r border-border 
          transition-all duration-200 ease-out overflow-hidden
          ${sidebarOpen ? 'w-64' : 'w-0'}
        `}
      >
        <div className="p-4 h-full flex flex-col gap-4 w-64">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Controls
          </h3>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Keyboard</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-border bg-muted/50 hover:bg-muted text-foreground"
              onClick={sendCtrlAltDel}
              disabled={status !== 'connected'}
              data-testid="button-ctrl-alt-del"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Ctrl + Alt + Del
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-border bg-muted/50 hover:bg-muted text-foreground"
              onClick={() => sendKey(0xFF09, 'Tab')}
              disabled={status !== 'connected'}
              data-testid="button-send-tab"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-border bg-muted/50 hover:bg-muted text-foreground"
              onClick={() => sendKey(0xFF1B, 'Escape')}
              disabled={status !== 'connected'}
              data-testid="button-send-esc"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Escape
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-border bg-muted/50 hover:bg-muted text-foreground"
              onClick={() => sendKey(0xFF0D, 'Enter')}
              disabled={status !== 'connected'}
              data-testid="button-send-enter"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Enter
            </Button>
          </div>

          <div className="space-y-2 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Clipboard className="h-3 w-3" />
              Clipboard
            </p>
            <Textarea
              placeholder="Type or paste text here..."
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground text-sm min-h-[100px] resize-none"
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              data-testid="textarea-clipboard"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border bg-muted/50 hover:bg-muted text-foreground"
                onClick={pasteFromClipboard}
                data-testid="button-paste-clipboard"
              >
                <Copy className="h-3 w-3 mr-1" />
                Paste
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border bg-blue-600/20 hover:bg-blue-600/30 text-blue-400"
                onClick={sendClipboardText}
                disabled={status !== 'connected' || !clipboardText}
                data-testid="button-send-clipboard"
              >
                <Send className="h-3 w-3 mr-1" />
                Send
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paste text from your clipboard, then click Send to type it into the server.
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`
          absolute top-1/2 -translate-y-1/2 z-30
          bg-blue-600 hover:bg-blue-500 border-2 border-blue-400 
          rounded-r-lg p-2 text-white shadow-lg shadow-blue-600/30 
          transition-all duration-200 cursor-pointer
        `}
        style={{ left: sidebarOpen ? '256px' : '0' }}
        data-testid="button-toggle-sidebar"
      >
        {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>

      {/* Main Console Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header Bar */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-green-500' : 
                status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                'bg-red-500'
              }`} />
              <span className="text-sm text-muted-foreground">
                {status === 'connected' ? 'Connected' : 
                 status === 'connecting' ? 'Connecting...' : 
                 status === 'error' ? 'Connection Error' :
                 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Scale Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNativeSize(!nativeSize)}
              className={`text-xs gap-1.5 h-7 px-2 ${nativeSize ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-toggle-scale"
              title={nativeSize ? "Fit to screen" : "Show native size (1:1)"}
            >
              {nativeSize ? <Shrink className="h-3.5 w-3.5" /> : <Scan className="h-3.5 w-3.5" />}
              {nativeSize ? 'Native' : 'Fit'}
            </Button>

            {(status === 'disconnected' || status === 'error') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconnect}
                className="text-muted-foreground hover:text-foreground gap-1"
                data-testid="button-vnc-reconnect"
              >
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-muted-foreground hover:text-foreground h-8 w-8"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              data-testid="button-vnc-fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground hover:bg-red-500/20 h-8 w-8"
                title="Close console"
                data-testid="button-vnc-close"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* VNC Display Area */}
        <div className="flex-1 relative bg-black overflow-auto">
          {/* Status Overlays */}
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
              <GlassCard className="p-8 flex flex-col items-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-foreground font-medium">Connecting to Console...</p>
                <p className="text-muted-foreground text-sm mt-1">Please wait</p>
              </GlassCard>
            </div>
          )}

          {(status === 'disconnected' || status === 'error') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
              <GlassCard className="p-8 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                  <X className="h-6 w-6 text-red-500" />
                </div>
                <p className="text-foreground font-medium mb-1">
                  {status === 'error' ? 'Connection Failed' : 'Disconnected'}
                </p>
                <p className="text-muted-foreground text-sm mb-4">
                  {status === 'error' ? 'Unable to connect to the server' : 'The console session has ended'}
                </p>
                <Button 
                  onClick={handleReconnect} 
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-vnc-reconnect-main"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconnect
                </Button>
              </GlassCard>
            </div>
          )}

          {/* VNC Screen - scaleViewport for auto-fit, or native 1:1 */}
          <VncScreen
            key={key}
            url={wsUrl}
            scaleViewport={!nativeSize}
            background="#000000"
            style={{
              width: nativeSize ? undefined : '100%',
              height: nativeSize ? undefined : '100%',
              display: 'block',
            }}
            ref={vncRef}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSecurityFailure={handleSecurityFailure}
            rfbOptions={{
              credentials: { password },
              showDotCursor: true,
              localCursor: true
            }}
            data-testid="vnc-screen"
          />
        </div>
      </div>
    </div>
  );
}
