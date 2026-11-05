import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/locale";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "合译 — 中英互译",
  description: "合译：五智能体中英互译工坊。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://d8j0ntlcm91z4.cloudfront.net" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&family=Sora:wght@200;300;400&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("heyi.theme")||localStorage.getItem("theme")||"system";var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;var resolved=t==="dark"||(t!=="light"&&dark)?"dark":"light";document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(resolved);document.documentElement.style.colorScheme=resolved;}catch(e){}})();',
          }}
        />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider>
            <LocaleProvider>
              <AppShell>{children}</AppShell>
              <Toaster />
            </LocaleProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
