import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dixon Doggy Day Care and Boarding",
  description: "Day care, boarding, and grooming for Dixon's favorite dogs.",
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
