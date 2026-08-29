import Link from "next/link";
import GravitasApp from "@/components/GravitasApp";

const jumpHref = "#jump-in";

function JumpLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={jumpHref}
      className="inline-flex min-h-12 items-center rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(10,14,20,0.16)] transition hover:-translate-y-0.5 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#58a6ff]"
    >
      {children}
    </a>
  );
}

function ProductResultVisual() {
  return (
    <figure className="homepage-product-visual rounded-[2rem] border border-neutral-200 bg-[#0b0e12] p-4 text-neutral-100 shadow-2xl shadow-neutral-950/20">
      <div className="rounded-[1.35rem] border border-neutral-800 bg-gradient-to-br from-[#1b2026] to-[#080a0d] p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <span className="gravitas-blue-logo block scale-90 origin-left" aria-hidden="true" />
          <span className="rounded-full border border-[#C6A75A]/50 px-3 py-1 text-xs font-semibold text-[#f0d37d]">
            Credibility
          </span>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Editor’s Summary
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-200">
            <li>The opening promise is clear, but the proof arrives too late.</li>
            <li>The reader is asked to trust broad claims before seeing the mechanism.</li>
            <li>Credibility improves when the cost, product role and evidence appear earlier.</li>
          </ul>
        </div>
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/35 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            What needs to change and why it matters
          </p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-neutral-300">
            <p>🟢 Protect — The source already identifies a meaningful commercial problem.</p>
            <p>🟡 Consolidate — Reduce the explanatory preamble so authority arrives sooner.</p>
            <p>🔵 Introduce — Put specific proof beside the first claim that asks for trust.</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-4">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Rewrite</span>
            <span className="text-neutral-500">Closed</span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        A completed Gravitas result showing summary and change recommendations, with rewrite panels closed.
      </figcaption>
    </figure>
  );
}

function EmptyEditorVisual() {
  return (
    <figure className="relative rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-2xl shadow-neutral-950/10">
      <div className="rounded-[1.35rem] border border-neutral-800 bg-gradient-to-br from-[#171c22] to-[#07090c] p-5 text-neutral-100">
        <span className="gravitas-blue-logo block" aria-hidden="true" />
        <div className="mt-5 rounded-2xl border border-[#58a6ff]/25 bg-[#121820] p-4">
          <div className="mb-3 flex gap-2">
            <span className="rounded-lg border border-[#C6A75A] px-3 py-2 text-xs font-semibold text-[#C6A75A]">Text</span>
            <span className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400">URL</span>
            <span className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400">Images</span>
          </div>
          <div className="h-24 rounded-xl border border-neutral-800 bg-black/55 p-4 text-neutral-500">
            Paste here
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="h-12 flex-1 rounded-xl border border-neutral-800 bg-black/55" />
            <div className="h-12 w-full rounded-xl border border-neutral-800 bg-black/55 sm:w-44" />
          </div>
        </div>
      </div>
      <div className="absolute left-8 top-28 hidden rotate-[-8deg] text-[#1f5fa8] sm:block">
        <svg width="190" height="120" viewBox="0 0 190 120" fill="none" aria-hidden="true">
          <path d="M18 17c31 34 63 34 93 22 38-16 55 13 35 38-17 21-51 21-76 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M69 84l15-14M69 84l19 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <p className="absolute left-8 top-8 max-w-[14rem] -rotate-3 rounded-2xl bg-white/90 px-4 py-3 text-lg font-semibold leading-tight text-neutral-950 shadow-lg">
        Paste your current work here.
      </p>
      <figcaption className="sr-only">
        Empty Gravitas editor with an arrow pointing to the input field.
      </figcaption>
    </figure>
  );
}

export default function GravitasHomepage() {
  return (
    <main className="homepage-shell min-h-screen bg-[#f6f2eb] text-neutral-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Gravitas Narrative Intelligence home">
          <span className="gravitas-blue-logo block" aria-hidden="true" />
        </Link>
        <Link className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:text-neutral-950" href="/login">
          Login
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pb-24 lg:pt-16">
        <div>
          <p className="max-w-xl text-[clamp(2.8rem,7vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.07em]">
            I worked on it. I thought it was good. I sent it.
          </p>
          <p className="mt-6 text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-none tracking-[-0.055em] text-neutral-500">
            The numbers came back flat. Again.
          </p>
        </div>
        <div className="max-w-xl text-lg leading-8 text-neutral-700">
          <p>
            That feeling is familiar in email. But the same failure can occur in a proposal, report, application, landing page, internal recommendation or presentation.
          </p>
          <p className="mt-5">
            You did the work. The material is sound. Yet the person who receives it does not reach the conclusion you expected — or does not act at all.
          </p>
          <p className="mt-5 font-medium text-neutral-950">
            Most commercial writing is created from the seller’s viewpoint. Gravitas shows you what your reader sees.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <JumpLink>Jump In — try it on your own work</JumpLink>
            <span className="text-sm text-neutral-500">Bring a piece of work that matters.</span>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
        <div className="max-w-xl text-lg leading-8 text-neutral-700">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">What Gravitas gives you back</h2>
          <p className="mt-6">
            You bring the work that is nearly ready: an email, page, proposal, report, application or other piece that has to carry a decision.
          </p>
          <p className="mt-5">
            Gravitas gives you a structured reader-side assessment. It shows you what is most likely to affect attention, trust, clarity, credibility or action. It explains what needs to change and why it matters.
          </p>
          <p className="mt-5">
            Where a rewrite would help, it offers a practical response to a specific issue so you can see what would be different if that issue were resolved. The analysis comes first. The rewrite is there when you want it.
          </p>
          <p className="mt-5 font-medium text-neutral-950">
            You remain the author. Gravitas gives you a clearer view of the person you are trying to reach.
          </p>
        </div>
        <ProductResultVisual />
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16 text-lg leading-8 text-neutral-700 sm:px-8">
        <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">The problem is rarely a bad sentence.</h2>
        <p className="mt-6">
          Even seasoned writers, marketers and professionals can spend days producing work that is technically sound and still have it land badly. Not because they lack experience. Because they are looking at the work from inside it — and inside the work, the gaps do not feel like gaps.
        </p>
        <p className="mt-5">
          The problem is not usually “quality” in the abstract. It is a specific reader-side failure that quietly changes the outcome.
        </p>
        <p className="mt-5">
          The work may explain far more than the reader needs, until the central point disappears. It may make claims that are not properly supported, lose trust through statements the reader knows cannot really be proved, assume background knowledge the reader does not have, or ask for action before giving the reader a reason to care.
        </p>
        <p className="mt-5">
          None of that necessarily makes the writing bad. But any one of those things can be enough to weaken trust, lose attention or leave the reader unconvinced.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
        <div className="rounded-[2rem] bg-white p-6 text-lg leading-8 text-neutral-700 shadow-sm ring-1 ring-neutral-200 sm:p-8">
          <p className="font-semibold text-neutral-950">Here is a familiar opening.</p>
          <blockquote className="mt-5 border-l-4 border-neutral-300 pl-5 text-neutral-600">
            Business is moving faster than ever. Our innovative platform uses advanced AI to streamline operations, optimise performance and give your team the insights it needs to succeed. Book a demonstration to discover how we can transform your business.
          </blockquote>
        </div>
        <div className="text-lg leading-8 text-neutral-700">
          <p>
            It is not badly written. It identifies a problem, promises a solution and asks for the next step. The trouble is that a reader has seen this category of language too many times for it to create traction on its own.
          </p>
          <p className="mt-5">
            Gravitas may see that the reader understands the category, but not why this company deserves attention. “Advanced AI,” “optimise performance” and “transform your business” are claims they have encountered many times.
          </p>
          <p className="mt-5 rounded-[1.5rem] bg-neutral-950 p-6 text-neutral-100">
            When your team is still chasing information across spreadsheets, inboxes and weekly meetings, decisions slow down and important exceptions get missed. [Product] brings the operational signals that matter into one place, so managers can see what needs attention first — before small delays become expensive problems.
          </p>
          <p className="mt-5">
            Nothing magical has happened there. The work has simply begun where the reader can recognise a cost, then given the product a specific job that the rest of the page can prove.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16 text-lg leading-8 text-neutral-700 sm:px-8">
        <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">It does not tell you how to write.</h2>
        <p className="mt-6">
          Gravitas does not arrive with a doctrine. It does not require a personal story, manufacture urgency or turn every serious message into a familiar sales sequence.
        </p>
        <p className="mt-5">
          Gravitas examines the actual material, the reader it needs to reach and the decision it is asking that reader to make. Then it shows what is likely happening as the reader moves through it.
        </p>
        <div className="mt-8 grid gap-3 text-neutral-950 sm:grid-cols-2">
          {[
            "Where does attention weaken?",
            "What has the reader been asked to take on trust?",
            "What might they conclude too early?",
            "What needs to change for the work to become clearer, more credible or easier to act on?",
          ].map((question) => (
            <p key={question} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">{question}</p>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-lg leading-8 text-neutral-700 sm:px-8">
        <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">The same problem appears wherever work has to reach someone else.</h2>
        <p className="mt-6">
          An email campaign has to give a busy reader a reason to continue. A landing page has to make an unfamiliar offer understandable before the visitor leaves. A proposal has to let a decision-maker see why the recommendation is worth backing. A report has to make its conclusion feel earned — not merely asserted.
        </p>
        <p className="mt-5">
          The writer may be selling, advising, applying, reporting, teaching or asking for approval. The format changes. The pressure does not.
        </p>
        <p className="mt-5 font-medium text-neutral-950">
          You know what the work means. The reader only has the work in front of them. Gravitas helps close that gap.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="text-lg leading-8 text-neutral-700">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">It sits at the point where the work begins to matter.</h2>
          <p className="mt-6">
            You already have tools for drafting, editing, research and design. Gravitas comes later — after the facts are in place and the message is taking shape, when the decision is close and the cost of a missed reader reaction becomes real.
          </p>
          <p className="mt-5">
            Before it leaves, you get a final reader-side check. Not because every piece needs to be remade. Because the small things an author cannot see are often the things a reader cannot get past.
          </p>
          <div className="mt-8">
            <JumpLink>Try it on the work in front of you — Jump In</JumpLink>
          </div>
        </div>
        <EmptyEditorVisual />
      </section>

      <section id="jump-in" className="homepage-jump-bridge scroll-mt-6 bg-neutral-950 px-3 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl text-center text-neutral-100">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#58a6ff]">Start with the work that already matters.</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Bring the work you are already trying to make count.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-neutral-400">
            Choose the aspect of reader response you most need to understand. Your time begins when you run your first analysis.
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-5xl">
          <GravitasApp experience="jump-in" embedded requireAuthBeforeAnalysis />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-lg leading-8 text-neutral-700 sm:px-8">
        <h2 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-neutral-950">Founding Gravitas</h2>
        <p className="mt-6">
          We are opening a small group of Founder memberships for people who want this final reader-side check to become part of their serious work.
        </p>
        <div className="mt-8 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-neutral-200 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#1f5fa8]">Founding Member</p>
          <p className="mt-4 text-5xl font-semibold tracking-[-0.05em]">A$599 <span className="text-xl text-neutral-500">per year</span></p>
          <p className="mt-4 text-neutral-700">Full Gravitas access. The regular annual equivalent is A$1,164. Founder saving: A$565 in the first year.</p>
          <p className="mt-4 font-medium text-neutral-950">30 Founder memberships available.</p>
          <p className="mt-4 text-sm leading-6 text-neutral-500">
            Your Founder rate remains available for as long as your membership stays continuously active. Founding Memberships cannot be paused, transferred, reactivated or revived after cancellation.
          </p>
          <Link href="/login?next=/workbench" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-[#C6A75A] px-5 py-3 text-sm font-semibold text-neutral-950 hover:brightness-105">
            Become a Founding Member
          </Link>
        </div>
      </section>
    </main>
  );
}
