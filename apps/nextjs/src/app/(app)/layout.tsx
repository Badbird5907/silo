import {
  SidebarInset,
  SidebarProvider,
} from "@silo-storage/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <MobileNav />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
