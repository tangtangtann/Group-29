import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeLine — AI Medical Operations Coordination Center",
  description:
    "AI-powered patient load-balancing across a region, powered by Amazon Bedrock.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
