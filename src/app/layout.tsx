import "@gshl-styles";

import { type Metadata } from "next";
import { Barlow_Condensed, Oswald, Varela, Yellowtail } from "next/font/google";

import { cn } from "@gshl-utils";
import { TRPCReactProvider } from "@gshl-trpc";
import { Navbar } from "@gshl-nav";

const varela = Varela({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-varela",
});
const yellowtail = Yellowtail({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-yellowtail",
});
const barlow = Barlow_Condensed({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-barlow",
});
const oswald = Oswald({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-oswald",
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
          varela.variable,
          yellowtail.variable,
          barlow.variable,
          oswald.variable,
          "font-sans",
        )}
      >
        <TRPCReactProvider>
          <div className="mb-36">{children}</div>
          <Navbar />
        </TRPCReactProvider>
      </body>
    </html>
  );
}
