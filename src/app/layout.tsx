import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@/app/globals.css";

/**
 * Satoshi, self-hosted. Body text runs at 400/500; headings use 900, which is
 * the weight that echoes the logo wordmark.
 *
 * `next/font` fingerprints and preloads these and derives fallback metrics, so
 * the swap from the system font does not shift layout.
 */
const satoshi = localFont({
  src: [
    { path: "../fonts/satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/satoshi-900.woff2", weight: "900", style: "normal" }
  ],
  variable: "--font-satoshi",
  display: "swap",
  fallback: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"]
});

export const metadata: Metadata = {
  title: "Digital Kontakt Sales Portal",
  description: "Internal Pipedrive sales workflow portal"
};

export const viewport: Viewport = {
  themeColor: "#162944"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={satoshi.variable}>
      <body>{children}</body>
    </html>
  );
}
