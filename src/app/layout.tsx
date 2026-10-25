import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Veritas Engine",
    template: "%s | Veritas Engine"
  },
  description:
    "Academic integrity, similarity, citation and AI-writing analysis for institutions."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-50">{children}</body>
    </html>
  );
}
