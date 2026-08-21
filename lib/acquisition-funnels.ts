export const FUNNEL_SLUGS = ["email", "proposal", "landing-page"] as const;

export type FunnelSlug = (typeof FUNNEL_SLUGS)[number];

export type AcquisitionFunnel = {
  slug: FunnelSlug;
  mailchimpTag: string;
  eyebrow: string;
  heroImage: string;
  heroPosition: string;
  heroMobilePosition: string;
  headline: string;
  supportingLine: string;
  formHeading: string;
  formExplanation: string;
  cta: string;
  footerLine: string;
  jumpInTitle: string;
  jumpInPrompt: string;
  preferredSource: "text" | "url";
};

export const ACQUISITION_FUNNELS: Record<FunnelSlug, AcquisitionFunnel> = {
  email: {
    slug: "email",
    mailchimpTag: "gravitas_email_check_lead",
    eyebrow: "Gravitas Email Check",
    heroImage: "/doorways/email-hero.png",
    heroPosition: "40% center",
    heroMobilePosition: "48% center",
    headline: "Before you send an important email, know how it will land.",
    supportingLine: "See the likely reader reaction before tone, clarity or an unintended signal costs you dearly.",
    formHeading: "Give Gravitas 20 minutes with your email.",
    formExplanation: "See the reaction it is likely to create, uncover the signals working against you, and produce a stronger version before you send it.",
    cta: "Start my free 20-minute email check",
    footerLine: "No card required. Your 20 minutes begins with your first analysis.",
    jumpInTitle: "your free email check is ready.",
    jumpInPrompt: "Paste the email before you send it.",
    preferredSource: "text",
  },
  proposal: {
    slug: "proposal",
    mailchimpTag: "gravitas_proposal_check_lead",
    eyebrow: "Gravitas Proposal Check",
    heroImage: "/doorways/proposal-hero.png",
    heroPosition: "40% center",
    heroMobilePosition: "50% center",
    headline: "Before you send the proposal, find the hesitation.",
    supportingLine: "See where confidence weakens, risk rises or the decision loses momentum before it reaches your buyer.",
    formHeading: "Give Gravitas 20 minutes with your proposal.",
    formExplanation: "See the proposal from the buyer’s side, identify the points that may stall the decision, and strengthen them before you send it.",
    cta: "Start my free 20-minute proposal check",
    footerLine: "No card required. Your 20 minutes begins with your first analysis.",
    jumpInTitle: "your free proposal check is ready.",
    jumpInPrompt: "Paste one important section of your proposal.",
    preferredSource: "text",
  },
  "landing-page": {
    slug: "landing-page",
    mailchimpTag: "gravitas_landing_page_check_lead",
    eyebrow: "Gravitas Landing Page Check",
    heroImage: "/doorways/landing-page-hero.png",
    heroPosition: "40% center",
    heroMobilePosition: "50% center",
    headline: "Before you spend more on traffic, see what your visitors experience.",
    supportingLine: "See where attention weakens, trust drops or the next action becomes unclear as the page unfolds on screen.",
    formHeading: "Give Gravitas 20 minutes with your landing page.",
    formExplanation: "Experience the page from your visitor’s side, locate where momentum breaks, and identify what to change before you spend more on traffic.",
    cta: "Start my free 20-minute landing page check",
    footerLine: "No card required. Your 20 minutes begins with your first analysis.",
    jumpInTitle: "your free landing page check is ready.",
    jumpInPrompt: "Enter the page URL to analyse it in context.",
    preferredSource: "url",
  },
};

export function getAcquisitionFunnel(value: string) {
  return ACQUISITION_FUNNELS[value as FunnelSlug];
}
