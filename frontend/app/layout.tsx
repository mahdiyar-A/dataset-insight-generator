import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

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
    <html lang="en">
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