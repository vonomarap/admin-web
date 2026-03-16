import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AdminSessionProvider } from "../components/AdminSessionProvider";
import { AdminThemeProvider } from "../components/AdminThemeProvider";
import { FabMenu } from "../components/FabMenu";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "../lib/fontawesome";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Админ-панель",
  description: "Админ-панель магазина окон и дверей",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

// Without this, mobile browsers may use a ~980px layout viewport,
// and our responsive breakpoints won't trigger as expected.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`} data-theme="light">
      <body>
        <AdminThemeProvider>
          <AdminSessionProvider>
            {children}
            <FabMenu />
          </AdminSessionProvider>
        </AdminThemeProvider>
      </body>
    </html>
  );
}
