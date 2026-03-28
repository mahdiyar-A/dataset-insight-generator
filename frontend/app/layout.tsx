import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import ThemeWrapper from "../lib/ThemeWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dataset Insight Generator",
};

// Inline script that runs synchronously before React hydration to apply the
// persisted theme class — prevents a flash of wrong theme on refresh.
const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('app_theme');
    if (t === 'Dark') {
      document.documentElement.classList.add('dark');
    } else if (t === 'Light') {
      document.documentElement.classList.remove('dark');
    } else if (!t || t === 'System') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    }
    // Restore accent CSS vars
    var accent = localStorage.getItem('setting_accent') || 'Blue';
    var ACCENT_MAP = {
      Blue:   ['#3b82f6','#6366f1','59,130,246'],
      Purple: ['#7c3aed','#a78bfa','124,58,237'],
      Teal:   ['#0ea5a4','#34d399','14,165,164'],
      Sunset: ['#ff7a18','#ffb86b','255,122,24'],
      Green:  ['#10b981','#22c55e','16,185,129'],
    };
    var cols = ACCENT_MAP[accent] || ACCENT_MAP['Blue'];
    var r = document.documentElement;
    r.style.setProperty('--accent', cols[0]);
    r.style.setProperty('--accent2', cols[1]);
    r.style.setProperty('--accent1', cols[0]);
    r.style.setProperty('--accent-rgb', cols[2]);
    r.style.setProperty('--accent-gradient', 'linear-gradient(90deg,' + cols[0] + ',' + cols[1] + ')');
    r.style.setProperty('--accent-soft', 'rgba(' + cols[2] + ',0.13)');
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          <AuthProvider>
            <ThemeWrapper>
              {children}
            </ThemeWrapper>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}