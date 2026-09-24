import Link from "next/link";

const checkoutUrl = process.env.FOUNDER_CHECKOUT_URL;

function FounderAction({ className }: { className?: string }) {
  if (checkoutUrl) {
    return <a className={className} href={checkoutUrl}>Become a Founder Member</a>;
  }

  return <a className={className} href="mailto:hello@multirrupt.ai?subject=Multirrupt%20Founder%20Membership">Ask about Founder membership</a>;
}

export default function FounderPage() {
  return (
    <main className="gravitas-shell min-h-screen px-4 py-5 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="gravitas-header flex items-center justify-between rounded-2xl px-5 py-4 sm:px-6">
          <Link href="/" aria-label="Multirrupt editor home" className="gravitas-blue-logo multirrupt-editor-logo" />
          <a href="https://multirrupt.com" className="text-sm text-slate-300 transition hover:text-white">How Multirrupt works <span aria-hidden="true">↗</span></a>
        </header>

        <section className="mx-auto grid max-w-5xl gap-8 py-14 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#6fb2ff]">A small founding group</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Help shape a different kind of writing intelligence.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Multirrupt looks at important writing from the reader’s side: what is likely to be understood, believed, felt, questioned or lost along the way.</p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">We are opening a small Founder membership for people who write work that matters and want to help shape where this goes next.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <FounderAction className="rounded-xl bg-[#e7725c] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#f1846f]" />
              <a href="https://multirrupt.com" className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white">See Multirrupt first</a>
            </div>
          </div>

          <aside className="gravitas-input-panel rounded-2xl p-6 sm:p-7">
            <p className="text-sm font-semibold text-[#6fb2ff]">Founder Member</p>
            <p className="mt-3 text-4xl font-semibold text-white">US$67 <span className="text-base font-medium text-slate-400">/ month</span></p>
            <p className="mt-2 text-sm leading-6 text-slate-400">A grandfathered rate for as long as you remain a member.</p>
            <div className="my-6 h-px bg-slate-700/70" />
            <ul className="space-y-3 text-sm leading-6 text-slate-300">
              <li><span className="mr-2 text-[#6fb2ff]">✓</span>Full Multirrupt access</li>
              <li><span className="mr-2 text-[#6fb2ff]">✓</span>Direct input into the product’s development</li>
              <li><span className="mr-2 text-[#6fb2ff]">✓</span>Private Founder group</li>
              <li><span className="mr-2 text-[#6fb2ff]">✓</span>30-day money-back guarantee</li>
            </ul>
          </aside>
        </section>

        <section className="grid gap-4 border-t border-slate-800 py-12 md:grid-cols-3">
          {[ 
            ["For work with consequences", "Emails, proposals, articles, pages, reports and the work you may be too close to assess clearly yourself."],
            ["For independent judgment", "Multirrupt is not here to flatter the writer or produce another generic rewrite. It helps show the reader experience your work is creating."],
            ["For people who want a hand in it", "Founder Members are early users, not a focus group for show. Their use and feedback help direct what Multirrupt becomes next."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-slate-800 bg-slate-950/35 p-6">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
            </article>
          ))}
        </section>

        <section className="gravitas-output mb-8 rounded-2xl px-6 py-10 text-center sm:px-10">
          <h2 className="text-2xl font-semibold text-white">This is deliberately a small group.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-400">If the work is useful to you, and you want a closer view of a product that is still taking shape, Founder membership is the right place to begin.</p>
          <FounderAction className="mt-7 inline-flex rounded-xl bg-[#e7725c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#f1846f]" />
          <p className="mt-5 text-xs text-slate-500">New to Multirrupt? <a className="text-slate-300 underline underline-offset-4 hover:text-white" href="https://multirrupt.com">See how it works first.</a></p>
        </section>
      </div>
    </main>
  );
}
