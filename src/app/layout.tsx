import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShipScout — Vessel Intelligence",
  description: "Find scrap-eligible vessels before anyone else does.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>
        <Layout>
          <ErrorBoundary label="page">{children}</ErrorBoundary>
        </Layout>
      </body>
    </html>
  );
}
