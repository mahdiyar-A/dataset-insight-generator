
import "./globals.css";


export const metadata = {
  title: "Dataset Insight Generator",
  description: "Next.js Frontend",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
