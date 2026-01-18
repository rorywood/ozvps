import { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AdminLayout({ children, title = "Admin" }: AdminLayoutProps) {
  useDocumentTitle(title);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(219, 95%, 5%)' }}>
      <AdminSidebar />

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="min-h-screen">
          {/* Top spacing for mobile menu button */}
          <div className="h-16 lg:h-0" />

          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
