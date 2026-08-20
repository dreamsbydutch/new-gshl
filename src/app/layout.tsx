import { type Metadata, type Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "@gshl-styles";

import { cn } from "@gshl-utils";
import { AppShell } from "@gshl-nav";
import { AuthProvider } from "@gshl-components/auth";
import { PerformanceVitals } from "@gshl-components/performance/PerformanceVitals";
import { ConvexClientProvider } from "@gshl-components/auth/ConvexClientProvider";
import { Toaster } from "@gshl-ui";

export const metadata: Metadata = {
  title: {
    template: "%s | GSHL",
    default: "GSHL",
  },
  description: "Gem Stone Hockey League",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes"></meta>
        <meta name="apple-mobile-web-app-capable" content="yes"></meta>
        <link rel="apple-touch-icon" href="/favicon.ico"></link>
        <link rel="apple-touch-startup-image" href="/favicon.ico"></link>
        <meta name="mobile-web-app-title" content="GSHL App"></meta>
        <meta name="apple-mobile-web-app-title" content="GSHL App"></meta>
      </head>
      <body
        className={cn(
          GeistSans.variable,
          GeistMono.variable,
          // Preserve legacy utility names while moving every text role onto
          // bundled, locally served font files.
          "[--font-barlow:var(--font-geist-sans)] [--font-oswald:var(--font-geist-sans)] [--font-varela:var(--font-geist-sans)] [--font-yellowtail:var(--font-geist-sans)]",
          "font-sans antialiased",
        )}
      >
        <AuthProvider>
          <ConvexClientProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
            <PerformanceVitals />
          </ConvexClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
