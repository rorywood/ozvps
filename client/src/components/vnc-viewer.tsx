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
  Keyboard,
  Send,
  Copy,
  Monitor,
  Scan,
  Shrink,
  Settings2,
  MousePointer,
  MousePointerClick
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface VncViewerProps {
  wsUrl: string;
  password: string;
  onDisconnect?: () => void;
  onClose?: () => void;
}

export function VncViewer({ wsUrl, password, onDisconnect, onClose }: VncViewerProps) {
  const vncRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vncAreaRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [key, setKey] = useState(0);
  const [clipboardText, setClipboardText] = useState("");
  const [nativeSize, setNativeSize] = useState(false);
  const [consoleFocused, setConsoleFocused] = useState(false);

  const handleConnect = useCallback(() => {
    setStatus('connected');
  }, []);

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

  // Handle console focus - cursor hides only when clicked into console
  const handleConsoleClick = () => {
    setConsoleFocused(true);
  };

  const handleConsoleBlur = () => {
    setConsoleFocused(false);
  };

  // Update cursor style based on focus state
  useEffect(() => {
    const vncContainer = document.querySelector('[data-testid="vnc-screen"]');
    if (!vncContainer) return;

    const updateCursor = () => {
      const canvases = vncContainer.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        if (consoleFocused) {
          // When focused, let noVNC handle cursor (hide or show dot)
          canvas.style.removeProperty('cursor');
        } else {
          // When not focused, show normal cursor
          canvas.style.setProperty('cursor', 'default', 'important');
        }
      });
    };

    updateCursor();

    // Watch for new canvases
    const observer = new MutationObserver(() => updateCursor());
    observer.observe(vncContainer, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [consoleFocused, key, status]);

  // Handle click outside console to unfocus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vncAreaRef.current && !vncAreaRef.current.contains(e.target as Node)) {
        setConsoleFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-black">
      {/* Header Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background border-b border-border">
        {/* Left: Status */}
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
               status === 'error' ? 'Error' :
               'Disconnected'}
            </span>
          </div>
          {consoleFocused && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
              <MousePointerClick className="h-3 w-3 text-primary" />
              <span className="text-xs text-primary">Console Active</span>
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1">
          {/* Keyboard Controls Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5"
                disabled={status !== 'connected'}
                data-testid="button-keyboard-menu"
              >
                <Keyboard className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">Keys</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground px-2 py-1">Send Key Combination</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-sm"
                  onClick={sendCtrlAltDel}
                  data-testid="button-ctrl-alt-del"
                >
                  Ctrl + Alt + Del
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-sm"
                  onClick={() => sendKey(0xFF09, 'Tab')}
                  data-testid="button-send-tab"
                >
                  Tab
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-sm"
                  onClick={() => sendKey(0xFF1B, 'Escape')}
                  data-testid="button-send-esc"
                >
                  Escape
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-sm"
                  onClick={() => sendKey(0xFF0D, 'Enter')}
                  data-testid="button-send-enter"
                >
                  Enter
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Clipboard Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5"
                disabled={status !== 'connected'}
                data-testid="button-clipboard-menu"
              >
                <Copy className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">Clipboard</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste text here and send it to the server as keystrokes
                </p>
                <Textarea
                  placeholder="Type or paste text..."
                  className="min-h-[80px] text-sm resize-none"
                  value={clipboardText}
                  onChange={(e) => setClipboardText(e.target.value)}
                  data-testid="textarea-clipboard"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={pasteFromClipboard}
                    data-testid="button-paste-clipboard"
                  >
                    <Copy className="h-3 w-3 mr-1.5" />
                    Paste
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={sendClipboardText}
                    disabled={!clipboardText}
                    data-testid="button-send-clipboard"
                  >
                    <Send className="h-3 w-3 mr-1.5" />
                    Send
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-5 bg-border mx-1" />

          {/* View Controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNativeSize(!nativeSize)}
            className={`h-8 px-2 gap-1.5 ${nativeSize ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="button-toggle-scale"
            title={nativeSize ? "Fit to screen" : "Show native size (1:1)"}
          >
            {nativeSize ? <Shrink className="h-4 w-4" /> : <Scan className="h-4 w-4" />}
            <span className="text-xs hidden sm:inline">{nativeSize ? '1:1' : 'Fit'}</span>
          </Button>

          {(status === 'disconnected' || status === 'error') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReconnect}
              className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5"
              data-testid="button-vnc-reconnect"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Reconnect</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
              className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
              title="Close console"
              data-testid="button-vnc-close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* VNC Display Area */}
      <div
        ref={vncAreaRef}
        className="flex-1 relative bg-black overflow-auto"
        onClick={handleConsoleClick}
      >
        {/* Click to focus hint */}
        {status === 'connected' && !consoleFocused && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-xs text-muted-foreground">
              <MousePointer className="h-3 w-3" />
              Click to interact with console
            </div>
          </div>
        )}

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

        {/* VNC Screen */}
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
            localCursor: consoleFocused
          }}
          data-testid="vnc-screen"
        />
      </div>
    </div>
  );
}
