import { useRef, useState, useEffect } from "react";
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
  ZoomIn,
  ZoomOut
} from "lucide-react";

const ZOOM_PRESETS = [1.0, 1.25, 1.5, 1.75, 2.0] as const;
const ZOOM_STORAGE_KEY = 'consoleScale';

function getStoredZoom(): number {
  try {
    const stored = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (stored) {
      const value = parseFloat(stored);
      if (ZOOM_PRESETS.includes(value as any)) {
        return value;
      }
    }
  } catch (e) {}
  return 1.5; // Default to 150%
}

function setStoredZoom(value: number): void {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, value.toString());
  } catch (e) {}
}

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
  const [zoom, setZoom] = useState(getStoredZoom);

  const handleZoomChange = (direction: 'in' | 'out') => {
    const currentIndex = ZOOM_PRESETS.indexOf(zoom as any);
    let newIndex = currentIndex;
    if (direction === 'in' && currentIndex < ZOOM_PRESETS.length - 1) {
      newIndex = currentIndex + 1;
    } else if (direction === 'out' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    }
    const newZoom = ZOOM_PRESETS[newIndex];
    setZoom(newZoom);
    setStoredZoom(newZoom);
  };

  const handleConnect = () => {
    setStatus('connected');
    // Force cursor visibility on the canvas after connect
    forceCursorVisible();
  };
  
  // Force the canvas cursor to be visible by directly mutating the style
  const forceCursorVisible = () => {
    const vncContainer = document.querySelector('[data-testid="vnc-container"]');
    if (vncContainer) {
      const canvases = vncContainer.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        if (canvas.style.cursor === 'none' || !canvas.style.cursor) {
          canvas.style.setProperty('cursor', 'crosshair', 'important');
        }
      });
    }
  };
  
  // Use MutationObserver to catch when noVNC resets cursor to none
  useEffect(() => {
    const vncContainer = document.querySelector('[data-testid="vnc-container"]');
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
    
    // Observe all canvases for style changes
    const canvases = vncContainer.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
      // Initial force
      (canvas as HTMLElement).style.setProperty('cursor', 'crosshair', 'important');
    });
    
    // Also observe container for new canvases
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

  const handleDisconnect = () => {
    setStatus('disconnected');
    if (onDisconnect) onDisconnect();
  };

  const handleSecurityFailure = () => {
    setStatus('error');
  };

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

  // Send Ctrl+Alt+Del
  const sendCtrlAltDel = () => {
    const rfb = vncRef.current?.rfb;
    if (rfb) {
      rfb.sendCtrlAltDel();
    }
  };

  // Send key combination helper
  const sendKey = (keysym: number, code: string) => {
    const rfb = vncRef.current?.rfb;
    if (rfb) {
      rfb.sendKey(keysym, code, true);
      rfb.sendKey(keysym, code, false);
    }
  };

  // Characters that require Shift key to be pressed
  const SHIFT_CHARS = '~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SHIFT_KEYSYM = 0xFFE1; // XK_Shift_L

  // Map character to its base keysym (the key without shift)
  const getKeysymForChar = (char: string): number => {
    const code = char.charCodeAt(0);
    
    // Special keys
    if (char === '\n' || char === '\r') return 0xFF0D; // Return/Enter
    if (char === '\t') return 0xFF09; // Tab
    if (char === '\b') return 0xFF08; // Backspace
    if (char === ' ') return 0x0020; // Space
    
    // For printable ASCII, keysym equals the character code
    if (code >= 32 && code <= 126) {
      return code;
    }
    
    return code;
  };

  // Send text to clipboard/paste with proper case sensitivity
  const sendClipboardText = async () => {
    const rfb = vncRef.current?.rfb;
    if (!rfb || !clipboardText) return;

    for (const char of clipboardText) {
      const needsShift = SHIFT_CHARS.includes(char);
      const keysym = getKeysymForChar(char);
      
      // Press Shift if needed for uppercase/symbols
      if (needsShift) {
        rfb.sendKey(SHIFT_KEYSYM, 'ShiftLeft', true);
      }
      
      // Send the actual key
      rfb.sendKey(keysym, null, true);
      rfb.sendKey(keysym, null, false);
      
      // Release Shift if we pressed it
      if (needsShift) {
        rfb.sendKey(SHIFT_KEYSYM, 'ShiftLeft', false);
      }
      
      // Small delay between characters for reliability
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };

  // Paste from local clipboard
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

  // Continuously force cursor visibility on canvas (noVNC uses inline styles)
  useEffect(() => {
    const forceInterval = setInterval(() => {
      forceCursorVisible();
    }, 500);
    
    // Initial force
    forceCursorVisible();
    
    return () => clearInterval(forceInterval);
  }, [key]);

  return (
    <div ref={containerRef} className="flex h-full bg-black">
      {/* Side Control Panel */}
      <div className={`flex-shrink-0 bg-[#0a0a0a] border-r border-white/10 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0'} overflow-hidden`}>
        <div className="p-4 h-full flex flex-col gap-4 min-w-[256px]">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Controls
          </h3>
          
          {/* Keyboard Shortcuts */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Keyboard</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-white/10 bg-white/5 hover:bg-white/10 text-white"
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
              className="w-full justify-start border-white/10 bg-white/5 hover:bg-white/10 text-white"
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
              className="w-full justify-start border-white/10 bg-white/5 hover:bg-white/10 text-white"
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
              className="w-full justify-start border-white/10 bg-white/5 hover:bg-white/10 text-white"
              onClick={() => sendKey(0xFF0D, 'Enter')}
              disabled={status !== 'connected'}
              data-testid="button-send-enter"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Enter
            </Button>
          </div>
          
          {/* Clipboard */}
          <div className="space-y-2 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Clipboard className="h-3 w-3" />
              Clipboard
            </p>
            <Textarea
              placeholder="Type or paste text here..."
              className="bg-white/5 border-white/10 text-white placeholder:text-muted-foreground text-sm min-h-[100px] resize-none"
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              data-testid="textarea-clipboard"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-white"
                onClick={pasteFromClipboard}
                data-testid="button-paste-clipboard"
              >
                <Copy className="h-3 w-3 mr-1" />
                Paste
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-white/10 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400"
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
      
      {/* Toggle Sidebar Button - Always visible with clear styling */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-1/2 -translate-y-1/2 z-20 bg-blue-600 hover:bg-blue-500 border-2 border-blue-400 rounded-r-lg p-2 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
        style={{ left: sidebarOpen ? '256px' : '0' }}
        data-testid="button-toggle-sidebar"
      >
        {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>

      {/* Main VNC Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a0a] border-b border-white/10">
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
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white/5 rounded-md border border-white/10 px-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleZoomChange('out')}
                className="text-muted-foreground hover:text-white h-7 w-7"
                disabled={zoom === ZOOM_PRESETS[0]}
                data-testid="button-zoom-out"
                title="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleZoomChange('in')}
                className="text-muted-foreground hover:text-white h-7 w-7"
                disabled={zoom === ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
                data-testid="button-zoom-in"
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            {(status === 'disconnected' || status === 'error') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconnect}
                className="text-muted-foreground hover:text-white"
                data-testid="button-vnc-reconnect"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Reconnect
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-muted-foreground hover:text-white h-8 w-8"
              data-testid="button-vnc-fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-muted-foreground hover:text-white h-8 w-8"
                data-testid="button-vnc-close"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* VNC Screen */}
        <div className="flex-1 relative">
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <GlassCard className="p-8 flex flex-col items-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-white font-medium">Connecting to Console...</p>
              </GlassCard>
            </div>
          )}
          
          {(status === 'disconnected' || status === 'error') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <GlassCard className="p-8 flex flex-col items-center">
                <p className="text-white font-medium mb-4">
                  {status === 'error' ? 'Connection Failed' : 'Disconnected'}
                </p>
                <Button onClick={handleReconnect} className="bg-primary hover:bg-primary/90" data-testid="button-vnc-reconnect-main">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconnect
                </Button>
              </GlassCard>
            </div>
          )}
          
          <div 
            className="w-full h-full overflow-auto"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
            }}
          >
            <VncScreen
              key={key}
              url={wsUrl}
              scaleViewport
              background="#000000"
              style={{ 
                width: '100%', 
                height: '100%', 
                minHeight: '400px'
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
              data-testid="vnc-container"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
