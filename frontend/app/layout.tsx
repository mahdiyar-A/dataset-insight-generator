import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dataset Insight Generator",
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