import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { AdminToaster } from "../components/AdminToaster";
import { ConfirmDialogProvider } from "../components/ConfirmDialogProvider";
import { AdminSessionProvider } from "../components/AdminSessionProvider";
import { FabMenu } from "../components/FabMenu";
import { ThemeProvider } from "../components/theme-provider";
import "./globals.css";

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
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <ConfirmDialogProvider>
            <AdminSessionProvider>
              {children}
              <FabMenu />
              <AdminToaster />
            </AdminSessionProvider>
          </ConfirmDialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
