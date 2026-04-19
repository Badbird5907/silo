import type { Metadata } from "next";
import { Geist_Mono, Inter, Geist } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";

import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Silo Docs",
  description: "Documentation for the Silo SDK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(inter.variable, geistMono.variable, "font-sans", geist.variable)} suppressHydrationWarning>
      <body
        // required styles
        className="flex flex-col min-h-screen"
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
