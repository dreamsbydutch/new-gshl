import { type Metadata } from "next";
import { Varela_Round } from "next/font/google";

import "@gshl-styles";

import { cn } from "@gshl-utils";
import { Navbar } from "@gshl-nav";
import { NavDefaults } from "@gshl-components/nav/NavDefaults";
import { AuthProvider } from "@gshl-components/auth";
import { PerformanceVitals } from "@gshl-components/performance/PerformanceVitals";
import { ConvexClientProvider } from "@gshl-components/auth/ConvexClientProvider";
import { Toaster } from "@gshl-ui";

const varelaRound = Varela_Round({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-varela",
});

export const metadata: Metadata = {
  title: {
    template: "%s | GSHL",
    default: "GSHL",
  },
  description: "Gem Stone Hockey League",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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
          varelaRound.variable,
          // Preserve the existing Tailwind font contracts while keeping
          // Varela Round as the app-wide typeface.
          "[--font-barlow:var(--font-varela)] [--font-oswald:var(--font-varela)] [--font-yellowtail:var(--font-varela)]",
          "font-varela",
        )}
      >
        <AuthProvider>
          <ConvexClientProvider>
            <NavDefaults />
            <div className="pb-20 pt-5 lg:pb-8 lg:pt-16">{children}</div>
            <Navbar />
            <Toaster />
            <PerformanceVitals />
          </ConvexClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
