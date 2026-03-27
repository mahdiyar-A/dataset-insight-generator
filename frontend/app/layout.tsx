import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";
import ThemeWrapper from "../lib/ThemeWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dataset Insight Generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeWrapper>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeWrapper>
      </body>
    </html>
  );
}