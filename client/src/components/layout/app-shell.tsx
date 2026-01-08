import { TopNav } from "./top-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-foreground">
      <TopNav />
      <main className="min-h-screen pt-20 lg:pt-20 flex flex-col">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl animate-in fade-in duration-500 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
