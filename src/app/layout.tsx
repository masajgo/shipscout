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
  title: "ShipScout — Direct Vessel Opportunities. Verified Buyers. Secure Transactions.",
  description: "ShipScout connects shipowners directly with verified recycling yards and cash buyers for confidential vessel sales and recycling transactions.",
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
