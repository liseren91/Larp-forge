import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "LARP Forge — AI-Powered LARP Game Design",
  description:
    "An AI-first workspace for designing live-action role-playing games. Build character webs, generate briefs, and manage your game — all in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased bg-zinc-950 text-zinc-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
