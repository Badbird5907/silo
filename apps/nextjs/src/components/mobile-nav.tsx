"use client";

import { LogOut, MenuIcon, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@silo-storage/ui/components/avatar";
import { Button } from "@silo-storage/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
import { useSidebar } from "@silo-storage/ui/components/sidebar";

import { authClient } from "@/auth/client";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function ThemeMenuItem() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const getThemeLabel = () => {
    if (theme === "dark") return "Dark";
    if (theme === "system") return "System";
    return "Light";
  };

  const getThemeIcon = () => {
    if (theme === "dark") return <Moon className="size-4" />;
    if (theme === "system") return <Monitor className="size-4" />;
    return <Sun className="size-4" />;
  };

  return (
    <DropdownMenuItem onClick={cycleTheme} className="gap-2">
      {getThemeIcon()}
      <span>Theme: {getThemeLabel()}</span>
    </DropdownMenuItem>
  );
}

export function MobileNav() {
  const { toggleSidebar } = useSidebar();
  const { data: session } = authClient.useSession();

  const user = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        avatar: session.user.image ?? undefined,
      }
    : null;

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={toggleSidebar}
        aria-label="Open menu"
      >
        <MenuIcon className="size-5" />
      </Button>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9 rounded-full">
              <Avatar className="size-8">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-medium text-white">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2 py-2 text-left text-sm">
                <Avatar className="size-10 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-medium text-white">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive gap-2"
            >
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
