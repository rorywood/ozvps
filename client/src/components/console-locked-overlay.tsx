import { Clock, Terminal } from "lucide-react";

interface ConsoleLockedOverlayProps {
  remainingSeconds: number;
}

export function ConsoleLockedOverlay({ remainingSeconds }: ConsoleLockedOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
          <Terminal className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Console Initializing</h2>
          <p className="text-muted-foreground">
            The server is starting up. Console access will be available shortly.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-2xl font-mono text-primary">
          <Clock className="w-6 h-6" />
          <span data-testid="text-countdown">{remainingSeconds}s</span>
        </div>

        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${Math.max(0, (15 - remainingSeconds) / 15 * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
