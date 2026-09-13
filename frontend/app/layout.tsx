import type { Metadata } from "next";
import { Bricolage_Grotesque, Work_Sans } from "next/font/google";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

/**
 * Atlas's two faces, self-hosted by next/font so there is no render-blocking
 * request to a font CDN and no layout shift while they load. Exposed as CSS
 * variables rather than a className so a page can opt in per element.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase resolves every relative URL below, and is what lets Next emit
  // an absolute canonical link. Without it the .online and .ca domains serve
  // byte-identical pages with no canonical, so search engines treat them as
  // duplicates competing with each other.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Dataset Insight Generator — turn a CSV into a written analysis",
    template: "%s · Dataset Insight Generator",
  },
  // A page with no description leaves Google to invent the snippet from
  // whatever text it finds first.
  description:
    "Upload a CSV or Excel file and get back a written analysis: data quality "
    + "checks, optional cleaning, charts and a PDF report. No formulas, no setup.",
  keywords: [
    "dataset analysis", "CSV analysis", "automated data report",
    "data cleaning", "AI data insights", "PDF data report",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Dataset Insight Generator",
    url: SITE_URL,
    title: "Turn a spreadsheet into a written analysis",
    description:
      "Data quality checks, cleaning you approve, charts and a PDF report — from one CSV.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Turn a spreadsheet into a written analysis",
    description:
      "Data quality checks, cleaning you approve, charts and a PDF report — from one CSV.",
  },
  icons: {
    icon: "/DIG_Icon.png",
    shortcut: "/DIG_Icon.png",
    apple: "/DIG_Icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>
          <SettingsProvider>
            {children}
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}