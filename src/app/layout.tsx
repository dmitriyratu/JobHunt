import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import { SessionProvider } from "@/lib/useAppState";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "JobHunt — AI Outreach Email Generator",
  description:
    "Upload your resume, add a job description, and generate a tailored outreach email in seconds.",
};

/**
 * Without this, iOS Safari assumes a 980px-wide desktop page and scales the
 * whole thing down, which makes every control unreadably small.
 *
 * `maximumScale` is deliberately left alone: capping it would block pinch-zoom,
 * which people rely on. The way to stop iOS auto-zooming on input focus is a
 * 16px font on the field itself (see `.input-base`), not a zoom lock.
 *
 * `viewportFit` is also left at the default. With "cover" the page would extend
 * under the notch and home indicator and every fixed edge would need its own
 * env(safe-area-inset-*) handling; the default already insets the viewport, so
 * the sticky bottom nav clears the home indicator for free.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
