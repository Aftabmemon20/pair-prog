import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pairio-Lite | Pair Master",
  description: "Collaborative pair programming with an AI facilitator on the third seat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
