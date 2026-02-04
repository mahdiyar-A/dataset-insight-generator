import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";
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
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}