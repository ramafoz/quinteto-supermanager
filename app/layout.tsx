import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quinteto · A túa liga SuperManager",
  description: "Compara os cadros de xogadores da túa liga privada de SuperManager ACB.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="gl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
