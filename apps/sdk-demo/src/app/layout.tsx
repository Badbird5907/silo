import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { Nav } from "@/components/nav";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SiloRouterConfigProvider } from "@/lib/upload";
import { fileRouter } from "@/upload";
import { extractRouterConfig } from "@silo-storage/sdk-server";

import "./globals.css";
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Silo SDK Demo",
  description: "Demo of the Silo SDK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ClerkProvider>
            <Nav />
            <QueryProvider>
              <SiloRouterConfigProvider routerConfig={extractRouterConfig(fileRouter)}>
                {children}
              </SiloRouterConfigProvider>
            </QueryProvider>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
