"use client";

import { Sparkles } from "lucide-react";

import { HeroBrands } from "@/components/hero-brands";
import { HomeFeatures } from "@/components/home-features";
import { HomeLeads } from "@/components/home-leads";
import { HowToUse } from "@/components/how-to-use";
import { QuietLink } from "@/components/quiet-link";
import { UserReviews } from "@/components/user-reviews";
import { useLocale } from "@/lib/locale";

export function HomeLanding() {
  const { t } = useLocale();

  return (
    <div className="home">
      <section className="home-hero">
        <p className="chip" suppressHydrationWarning>
          <i className="fa-solid fa-feather-pointed" aria-hidden="true" />
          {t.altPrefix}
        </p>
        <HeroBrands lines={t.altBrands} />
        <HomeLeads lines={t.homeLeads} />
        <QuietLink href="/workshop#practice" className="icon-flow site-nav__cta home-cta">
          <Sparkles className="size-4" />
          {t.freeStart}
        </QuietLink>
      </section>

      <HomeFeatures />
      <HowToUse embedded />
      <UserReviews />
    </div>
  );
}
