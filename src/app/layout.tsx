import "@gshl-styles";

import { type Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Varela_Round } from "next/font/google";

import { cn } from "@gshl-utils";
import { Navbar } from "@gshl-nav";
import { NavDefaults } from "@gshl-components/nav/NavDefaults";
import { AuthProvider } from "@gshl-components/auth";
import { PerformanceVitals } from "@gshl-components/performance/PerformanceVitals";
import { ConvexClientProvider } from "@gshl-components/auth/ConvexClientProvider";

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
          GeistSans.variable,
          varelaRound.variable,
          // Preserve the existing Tailwind font contracts while using one
          // locally bundled font file for the secondary type treatments.
          "[--font-barlow:var(--font-geist-sans)] [--font-oswald:var(--font-geist-sans)] [--font-yellowtail:var(--font-geist-sans)]",
          "font-varela",
        )}
      >
        <AuthProvider>
          <ConvexClientProvider>
            <NavDefaults />
            <div className="pb-20 lg:pb-8 lg:pt-16">{children}</div>
            <Navbar />
            <PerformanceVitals />
          </ConvexClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
