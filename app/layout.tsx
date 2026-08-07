import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { RuntimeConfigProvider } from "@/components/RuntimeConfigProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteIconProvider } from "@/components/SiteIconProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UXUVideo",
  description: "UXUVideo 公共静态前端入口",
  manifest: "/manifest.json",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "UXUVideo" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#080b12" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <RuntimeConfigProvider>
          <SiteIconProvider>
            <PasswordGate>{children}</PasswordGate>
          </SiteIconProvider>
          <ServiceWorkerRegister />
        </RuntimeConfigProvider>
      </body>
    </html>
  );
}
