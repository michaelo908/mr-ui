export const JUMP_IN_SAMPLES = [
  {
    id: "client-email",
    label: "Client email",
    description: "A follow-up that risks asking for too much, too soon.",
    content: `Subject: A quick next step for the website project

Hi Naomi,

I wanted to follow up on our conversation last Thursday. From what you described, the current site is doing an admirable job of explaining what you do, but it is not yet making the case for why a prospective client should choose you over the larger firms they are already comparing.

Our team could fix that quickly. We would begin with a strategy session, then rebuild the key pages around a clearer story, stronger proof and a more direct path to enquiry. We have done this for businesses in a similar position and have seen substantial improvements in both lead quality and conversion.

We only have two project openings left this month, so if you would like to secure one, send through the go-ahead today and I will have the paperwork prepared. The investment is $14,500, with half payable before work begins.

I have attached a short outline of the process. I think this is an excellent fit and would love to get moving.

Best,
Alex`,
  },
  {
    id: "landing-page",
    label: "Landing-page promotion",
    description: "A confident offer whose claims need more support.",
    content: `Finally, a leadership programme that gives your managers everything they need to transform their teams.

The Momentum Leadership Intensive is a practical eight-week programme for ambitious leaders who are tired of patching problems, carrying the emotional weight of the team and watching capable people underperform. You will learn the exact framework used by high-performing organisations to create accountability, confidence and measurable change.

In eight weeks you will communicate with authority, deal with difficult people without drama, make better decisions under pressure and build a culture where people take ownership. No theory for theory's sake — every session gives you a tool you can use the next morning.

Places are strictly limited. Join the next group now and become the leader your team has been waiting for.`,
  },
  {
    id: "proposal-opening",
    label: "Proposal opening (in depth)",
    description: "A longer strategic proposal — ideal for a fuller analysis.",
    content: `Proposal: A clearer member journey for the Regional Arts Network

Thank you for inviting Northbank Studio to respond to the Regional Arts Network's brief. We understand that the organisation has reached an important point: its programs are respected, its members are active, and its public purpose is widely supported. At the same time, the way people encounter the Network has become fragmented. A prospective member may find an event, a funding announcement, a social post or a recommendation from a colleague, but not necessarily a coherent sense of what joining makes possible.

Our proposal is designed to address that problem. Rather than beginning with a new website as an isolated deliverable, we recommend a member-journey project that clarifies the narrative connecting the Network's advocacy, professional development, events and member services. The website would be an important part of that work, but it would follow from a shared understanding of the audience, the choices they are making and the reasons they might hesitate.

The project would begin with a short discovery phase. We would speak with staff, board representatives and a cross-section of current and former members. We would review existing communications, the present website, event materials and the questions received by the membership team. This is not intended to reopen every strategic question facing the Network. It is intended to identify the few points where the current story is unclear, repetitive or difficult for an outside reader to act on.

From there, Northbank would develop a practical narrative framework. This would set out the central promise of membership, the different needs of emerging and established practitioners, the proof that supports the Network's claims, and a recommended order for key information. We would test the framework through draft pages and selected campaign material before moving into final design and build.

The outcome would be more than a refreshed visual presence. It would give staff a shared language for explaining the Network, a clearer route from first encounter to membership, and a set of reusable messages that can support future campaigns without beginning from scratch each time. It should also reduce the burden on staff who currently have to explain, individually and repeatedly, how the various parts of the organisation connect.

We recognise that the Network operates with a finite budget and a demanding annual calendar. For that reason, our proposed process is deliberately staged. The first phase creates useful clarity even if later design work is scheduled around funding or event commitments. The second phase can then focus resources on the pages and pathways that matter most, rather than attempting to rebuild every part of the site at once.

Our fee for the discovery and narrative framework phase is $18,000 plus GST. A detailed scope, timeline and optional design-and-build pathway are included in the following pages. We believe this approach will give the Regional Arts Network a more confident public presence, while preserving the complexity and generosity that members already value.`,
  },
] as const;

export type JumpInSampleId = (typeof JUMP_IN_SAMPLES)[number]["id"];

export function isJumpInSampleId(value: string): value is JumpInSampleId {
  return JUMP_IN_SAMPLES.some((sample) => sample.id === value);
}
