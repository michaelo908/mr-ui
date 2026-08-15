export const FUNNEL_SLUGS = ["email", "proposal", "landing-page"] as const;

export type FunnelSlug = (typeof FUNNEL_SLUGS)[number];

export type AcquisitionFunnel = {
  slug: FunnelSlug;
  mailchimpTag: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  problemTitle: string;
  problem: string;
  missedTitle: string;
  missed: string;
  sees: readonly string[];
  cta: string;
  jumpInTitle: string;
  jumpInPrompt: string;
  preferredSource: "text" | "url";
};

export const ACQUISITION_FUNNELS: Record<FunnelSlug, AcquisitionFunnel> = {
  email: {
    slug: "email",
    mailchimpTag: "gravitas_email_check_lead",
    eyebrow: "Gravitas Email Check",
    headline: "Before you send an important email, know how it will land.",
    subhead: "See the likely reader reaction before tone, clarity or an unintended signal costs you the response.",
    problemTitle: "You know what you meant. Your reader only sees what arrived.",
    problem: "Important emails fail in the gap between intention and reception. Once you have written the message, that gap is difficult to see from inside your own words.",
    missedTitle: "Writing tools improve sentences. They do not judge the encounter.",
    missed: "Gravitas reads for the response your message is likely to create: confidence, trust, resistance, uncertainty and momentum.",
    sees: ["Clarity and unintended interpretation", "Tone, trust and emotional pressure", "Response friction and the strength of the next step"],
    cta: "Unlock my free email check",
    jumpInTitle: "your free email check is ready.",
    jumpInPrompt: "Paste the email before you send it.",
    preferredSource: "text",
  },
  proposal: {
    slug: "proposal",
    mailchimpTag: "gravitas_proposal_check_lead",
    eyebrow: "Gravitas Proposal Check",
    headline: "Before you send the proposal, find the hesitation.",
    subhead: "See where confidence weakens, risk rises or the decision loses momentum before the proposal reaches your buyer.",
    problemTitle: "A proposal is judged by what the buyer believes after reading it.",
    problem: "Effort, detail and polish do not guarantee movement. A buyer can understand every word and still hesitate for reasons the writer cannot see.",
    missedTitle: "Proofreading finds errors. Gravitas finds decision friction.",
    missed: "Gravitas examines differentiation, evidence, perceived risk and the sequence of belief that turns consideration into action.",
    sees: ["Where confidence or differentiation weakens", "Questions, risk and unsupported claims", "Decision momentum and clarity of the next action"],
    cta: "Unlock my free proposal check",
    jumpInTitle: "your free proposal check is ready.",
    jumpInPrompt: "Paste one important section of your proposal.",
    preferredSource: "text",
  },
  "landing-page": {
    slug: "landing-page",
    mailchimpTag: "gravitas_landing_page_check_lead",
    eyebrow: "Gravitas Landing Page Check",
    headline: "Before you spend more on traffic, see what your visitors experience.",
    subhead: "Gravitas analyses your page in its natural environment—section by section, viewport by viewport.",
    problemTitle: "A landing page is not a block of copy. It is a journey.",
    problem: "Visitors experience hierarchy, whitespace, sequencing, proof and calls to action together. The words cannot be judged properly after they are stripped from the page.",
    missedTitle: "Most tools ask whether the copy is good. Gravitas asks what happens as someone experiences it.",
    missed: "The page is rendered as your visitor sees it, then analysed across ordered viewports to reveal changes in attention, trust, clarity and momentum.",
    sees: ["Where attention weakens from viewport to viewport", "Where trust drops or cognitive load rises", "Where the next action becomes unclear"],
    cta: "Unlock my free landing page check",
    jumpInTitle: "your free landing page check is ready.",
    jumpInPrompt: "Enter the page URL to analyse it in context.",
    preferredSource: "url",
  },
};

export function getAcquisitionFunnel(value: string) {
  return ACQUISITION_FUNNELS[value as FunnelSlug];
}
