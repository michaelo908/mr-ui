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
    id: "clearpoint-advisory",
    label: "Clearpoint Advisory — fictional sample",
    description: "A fictional sales letter. All companies and performance figures are fictional.",
    content: `Your business is growing. Why aren't your profits?

There comes a point in the life of a growing business when working harder stops producing the results it once did.

Revenue is increasing, your team is expanding, and your customers seem happy. Yet somehow, at the end of each month, there is less money available than you expected.

At Clearpoint Advisory, we have developed a revolutionary approach to business performance that challenges conventional management thinking and delivers exceptional results.

Our Business Performance Programme is now accepting applications for the coming quarter. Book your complimentary strategy session today to secure your place.

A different approach to business growth

Most business owners understand the importance of increasing revenue, managing expenditure and developing effective teams. Our programme addresses all three through a comprehensive framework that incorporates financial analysis, leadership development, operational efficiency and strategic planning.

Our consultants have more than 45 years of combined experience across multiple industries. We are passionate about helping ambitious business owners achieve their full potential.

But growing a business is also about personal freedom. Imagine being able to take a holiday without checking your phone, spend more time with your family and rediscover the enthusiasm that led you to start your business in the first place.

How the programme works

Over twelve weeks, we conduct a detailed assessment of your business, followed by fortnightly consulting sessions, access to our proprietary performance dashboard and a personalised implementation roadmap.

Our programme is designed to work for businesses of virtually any size and across all industry sectors.

The investment is $6,800, payable in three instalments. We believe this represents exceptional value compared with traditional consulting arrangements.

No two businesses are alike, which is why we never apply a standardised framework to our clients.

What we discovered

In one recent engagement, a commercial maintenance company was generating $2.4 million in annual revenue but struggling to meet its monthly financial commitments.

The owner believed the solution was to acquire more customers.

Our assessment revealed something quite different. Almost a third of the company's contracts were generating insufficient margins once travel, scheduling and administrative costs were properly allocated.

Acquiring more customers under the existing operating model would have made the financial problem worse.

Within six months of restructuring its service agreements, the company had improved its operating margin from 4% to 11%, without increasing its customer base.

This is the kind of insight our programme is designed to uncover.

Take the next step

Whether you're looking to increase profitability, develop your leadership skills, improve operational efficiency or simply find a better balance between work and life, Clearpoint Advisory can help.

Our initial consultation is completely obligation-free. During this session, we will determine whether your business qualifies for our programme.

Places are limited, so we encourage you to act quickly.

Contact us today and start building the business you've always dreamed of.`,
  },
] as const;

export type JumpInSampleId = (typeof JUMP_IN_SAMPLES)[number]["id"];

export function isJumpInSampleId(value: string): value is JumpInSampleId {
  return JUMP_IN_SAMPLES.some((sample) => sample.id === value);
}
