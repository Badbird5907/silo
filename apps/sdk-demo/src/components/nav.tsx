import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { ThemeToggle } from "@/components/theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex h-16 w-full max-w-none items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Silo SDK Demo
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />

          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Sign up
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}