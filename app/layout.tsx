import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// Display font for headings. Fraunces gives that warm, slightly bookish feel
// without sacrificing legibility at small sizes.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "Dixon Doggy Day Care and Boarding",
  description: "Day care, boarding, and grooming for Dixon's favorite dogs.",
  applicationName: "DDDC",
  appleWebApp: {
    capable: true,
    title: "DDDC",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          duration={4500}
          toastOptions={{
            classNames: {
              toast:
                "!rounded-2xl !border !shadow-lift !font-sans !text-sm",
              title: "!font-semibold",
              description: "!text-ink-700",
            },
          }}
        />
      </body>
    </html>
  );
}
