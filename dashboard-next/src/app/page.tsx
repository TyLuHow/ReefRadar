'use client';

import { ScrollProgress } from '@/components/ui/ScrollProgress';
import { HeroSection } from '@/components/landing/HeroSection';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { SoundSection } from '@/components/landing/SoundSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ImpactStats } from '@/components/landing/ImpactStats';
import { CTASection } from '@/components/landing/CTASection';

export default function LandingPage() {
  return (
    <>
      <ScrollProgress />
      <HeroSection />
      <ProblemSection />
      <SoundSection />
      <HowItWorks />
      <ImpactStats />
      <CTASection />
    </>
  );
}
