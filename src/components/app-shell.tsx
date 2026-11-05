"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Languages } from "lucide-react";

import { QuietLink } from "@/components/quiet-link";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLocale } from "@/lib/locale";

const VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_133255_956f653f-5d80-4b06-abd5-0f46c98b60fa.mp4";
const POSTER =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_132328_5f9029c8-218f-4489-82b6-29ff2849920e.png";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, t, setLocale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = [
    { href: "/", label: t.navWorkshop },
    { href: "/workshop", label: t.navPractice },
    { href: "/practice", label: t.navStudio },
    { href: "/glossary", label: t.navGlossary },
    { href: "/guide", label: t.navGuide },
    { href: "/settings", label: t.navSettings },
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="site">
      <div className="site__media">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={POSTER}
          suppressHydrationWarning
        >
          <source src={VIDEO} type="video/mp4" />
        </video>
      </div>
      <div className="site__scrim" />

      <div className="site__frame">
        <header className="site-nav z-[60]" suppressHydrationWarning>
          <QuietLink href="/" className="site-logo">
            {t.brand}
          </QuietLink>
          <div className="flex items-center gap-[clamp(24px,3.2vw,62px)]" suppressHydrationWarning>
            <nav className="site-nav__links" suppressHydrationWarning>
              {nav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <QuietLink
                    key={item.href}
                    href={item.href}
                    data-active={active}
                    className="site-nav__link"
                  >
                    {item.label}
                  </QuietLink>
                );
              })}
            </nav>
            <ThemeToggle />
            <button
              type="button"
              className="icon-flow site-nav__cta site-nav__desktop-cta locale-cta"
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              aria-label={t.switchLocaleAria}
              suppressHydrationWarning
            >
              <Languages className="size-3.5" />
              {t.switchLocale}
            </button>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobileMenu"
              aria-label={menuOpen ? t.closeMenu : t.openMenu}
              data-open={menuOpen}
              suppressHydrationWarning
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>

        <div
          id="mobileMenu"
          className="mobile-menu"
          data-open={menuOpen}
          role="dialog"
          aria-modal="true"
          aria-label={t.siteMenu}
          aria-hidden={!menuOpen}
          inert={menuOpen ? undefined : true}
          suppressHydrationWarning
        >
          {nav.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              style={{ transitionDelay: `${180 + index * 70}ms` }}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <ThemeToggle />
          <button
            type="button"
            className="icon-flow site-nav__cta locale-cta"
            style={{ transitionDelay: "460ms" }}
            suppressHydrationWarning
            onClick={() => {
              setLocale(locale === "zh" ? "en" : "zh");
              setMenuOpen(false);
            }}
          >
            <Languages className="size-5" />
            {t.switchLocale}
          </button>
        </div>

        <main className="site-main">
          {children}
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
