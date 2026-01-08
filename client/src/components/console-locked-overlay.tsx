import { Loader2, Terminal } from "lucide-react";

export function ConsoleLockedOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
          <Terminal className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Console Initializing</h2>
          <p className="text-muted-foreground">
            The server is restarting. Console access will be available shortly.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-primary">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span data-testid="text-console-initializing">Please wait...</span>
        </div>
      </div>
    </div>
  );
}
