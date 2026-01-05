import { useRef, useState, useEffect } from "react";
import { VncScreen } from "react-vnc";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Loader2, Maximize2, Minimize2, X, RefreshCw } from "lucide-react";

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

  const handleConnect = () => {
    setStatus('connected');
  };

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-black">
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
        
        <VncScreen
          key={key}
          url={wsUrl}
          scaleViewport
          background="#000000"
          style={{ width: '100%', height: '100%', minHeight: '400px' }}
          ref={vncRef}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSecurityFailure={handleSecurityFailure}
          rfbOptions={{
            credentials: { password }
          }}
          data-testid="vnc-container"
        />
      </div>
    </div>
  );
}
