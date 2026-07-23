import { SmoothScrollProvider } from "./lib/smooth-scroll"
import { ScrollProgress } from "./components/ScrollProgress"
import { Nav } from "./components/Nav"
import { HeroSection } from "./components/HeroSection"
import { FeaturesSection } from "./components/FeaturesSection"
import { AbstractShowcase } from "./components/AbstractShowcase"
import { HowItWorks } from "./components/HowItWorks"
import { FaqSection } from "./components/FaqSection"
import { Footer } from "./components/Footer"

/**
 * Internal-tool landing page (LANDING-DESIGN.md). White canvas, one red accent,
 * Fraunces display type, motion reveals + Lenis smooth scroll + a scroll-linked
 * progress bar. Nav → Hero → Features → Walkthrough → FAQ → Footer.
 */
export default function LandingPage() {
  return (
    <SmoothScrollProvider>
      <div className="min-h-screen bg-background font-sans antialiased">
        <ScrollProgress />
        <Nav />
        <HeroSection />
        <FeaturesSection />
        <AbstractShowcase />
        <HowItWorks />
        <FaqSection />
        {/* Smooth the page → dark-footer shift into the footer instead of a hard
            edge. Fades from the page background to the footer's near-black. */}
        <div aria-hidden className="h-24 bg-gradient-to-b from-background to-[#0a0a0c]" />
        <Footer />
      </div>
    </SmoothScrollProvider>
  )
}
