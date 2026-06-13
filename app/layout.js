import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Giveaway Builder Platform",
  description: "Deploy and manage cash giveaways",
};

import ReferralTracker from "./components/ReferralTracker";
import { Suspense } from "react";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <Suspense fallback={null}>
            <ReferralTracker />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
