import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { analyzeSubmission } from "../src/lib/analyzer";

const prisma = new PrismaClient();

const INTERNET_SOURCE = `The Economics of Renewable Energy Transitions

Renewable energy transitions are frequently described as a technical problem of replacing fossil generation with wind and solar capacity. That framing understates the institutional work required to integrate variable resources into a power system that was designed around dispatchable fuel. The economic case for renewables has improved dramatically over the past decade, but the cost of energy is only one line in the ledger. Grid operators must also finance transmission, storage, and the flexibility services that keep supply and demand aligned from second to second.

Levelized cost figures are useful for comparing generation technologies, yet they exclude the system costs that appear when intermittent resources reach high penetration. A system that draws thirty percent of its electricity from wind and solar can absorb variability with existing reserves and modest curtailment. A system that draws seventy percent requires storage, demand response, expanded transmission, and markets that pay for capacity rather than energy alone. The difference between those two systems is not a difference in the cost of panels or turbines. It is a difference in the architecture of the grid.

Policy design determines who bears those integration costs and how quickly they are recovered. Capacity markets, feed-in tariffs, contracts for difference, and renewable portfolio standards each distribute risk differently across investors, utilities, and consumers. Feed-in tariffs offer predictable revenue and have historically accelerated deployment, but they can lock in generous prices as technology costs fall. Contracts for difference preserve investor certainty while sharing efficiency gains with ratepayers through strike price adjustments. Portfolio standards are flexible and politically durable, yet they often leave the cheapest projects to compete on price alone, which can disadvantage storage and transmission investments that provide system-wide benefits.

Equity considerations sit alongside efficiency. Rooftop solar subsidies flow disproportionately to homeowners with taxable income and suitable roofs, while the fixed costs of the distribution network are spread across all customers. If grid modernization is financed through volumetric charges, low-income households can end up paying a larger share of the transition than their consumption or their carbon footprint would justify. A just transition requires explicit attention to rate design, access to efficiency programs, and targeted support for communities that host new infrastructure.

The central lesson is that decarbonization is a portfolio problem. Cheap generation is necessary but insufficient. The institutions that govern planning, procurement, and cost recovery determine whether a transition delivers reliable and affordable power or produces a backlash against the very technologies that make it possible.`;

const PUBLICATION_SOURCE = `Grid-Scale Storage and the Physics of Intermittency

Lithium-ion batteries have dominated recent deployments of grid-scale storage because their costs fell faster than almost any other energy technology. They excel at shifting energy across hours and at providing fast frequency response. They are a poor fit, however, for the multi-day lulls in wind output that occur when a slow-moving high-pressure system parks over a region. Energy is not the only constraint in those events; power capacity and duration are both binding. A battery farm sized to meet a four-hour evening peak may deliver less than half of its rated energy during a two-day period of low renewable production.

Pumped hydro remains the largest source of installed storage capacity worldwide, and its duration makes it structurally different from electrochemical batteries. A reservoir can hold weeks of potential energy, and its marginal cost of storage does not rise with the number of hours dispatched. The constraint is geography and permitting. Suitable sites are limited, construction timelines are measured in decades, and environmental review can delay projects beyond the planning horizon of most utilities. The result is a storage portfolio that is abundant in theoretical potential and thin in bankable projects.

Hydrogen offers a third pathway. Electrolyzers convert surplus electricity into a storable fuel that can be burned in turbines or fed into industrial processes. Round-trip efficiency is low compared with batteries, often between thirty and forty percent, which means that hydrogen is best reserved for applications where direct electrification is impractical. Seasonal storage, steel production, and long-haul shipping are plausible candidates. Using hydrogen to cover daily peaks that a battery could serve would waste energy and capital.

Market design has not caught up with the physics. Capacity markets typically pay for megawatts of firm capacity, not megawatt-hours of duration, so a four-hour battery and a twelve-hour battery can receive similar payments even though they provide different services during a prolonged shortfall. Energy-only markets expose storage owners to price volatility that may not reflect the system value of availability during rare events. Reliability standards that treat all storage as interchangeable obscure the distinction between power adequacy and energy adequacy, and they can produce a portfolio that performs well in ordinary weeks and fails in extreme ones.

The implication for policy is that storage procurement should specify duration, availability, and location rather than capacity alone. A portfolio that combines short-duration batteries for daily cycling, long-duration assets for seasonal balance, and flexible demand for peak management is more robust than any single technology deployed at scale.`;

const REPOSITORY_SOURCE = `Generative AI in First-Year Writing: A Classroom Study

Generative artificial intelligence arrived in first-year composition classrooms faster than most writing programs could revise their policies. In a study of two hundred and forty students across six sections of a required writing course, we examined how students described their use of language models, how instructors detected that use, and whether detection tools changed student behavior. Our central finding is that the distinction between assistance and authorship is more useful than the distinction between permitted and prohibited tools.

Students who used language models for brainstorming, outlining, and grammar review reported higher confidence in their writing and produced drafts with clearer organization. Students who used models to generate entire paragraphs reported lower confidence and were more likely to struggle when asked to revise without access to the tool. The difference was not explained by prior writing ability. It appeared in interviews as a difference in ownership: students who had made the structural decisions about their essays could explain and defend those decisions, while students who had outsourced the structure could not.

Instructor detection was unreliable. Across the six sections, instructors correctly identified model-assisted essays only slightly more often than chance, and they were more likely to flag writing that was unusually polished than writing that was actually generated. Detection software performed better on aggregate but produced false positives for multilingual writers and for students who had been coached to write in a formal register. The false positives were concentrated among students from groups that already experience disproportionate scrutiny in academic integrity processes.

We argue that writing programs should shift from policing tools to designing assessments that make authorship visible. Process portfolios, in-class drafting, reflective annotations, and oral defenses of written work provide evidence of student decision-making that a text-only detector cannot. These practices are not new, but the arrival of generative models gives them new urgency. They also distribute the burden of proof more fairly: instead of asking students to prove that they did not use a tool, instructors can ask all students to demonstrate how they composed their work.

The study has limitations. It was conducted at a single institution over one semester, and the tools available to students changed several times during the study period. Self-reported use is subject to social desirability bias, and the sample overrepresents students in writing-intensive majors. Nevertheless, the pattern was consistent across sections and was corroborated by interviews and draft comparisons. Writing programs that invest in process-based assessment appear better positioned to preserve both academic integrity and equitable outcomes than programs that rely primarily on detection.`;

const DEMO_SUBMISSION = `The Grid in Transition: Storage, Policy, and Equity

The shift to renewable electricity is often presented as a straightforward story of falling costs. Solar panels and wind turbines have become dramatically cheaper, and deployment has accelerated in most major economies. Yet the affordability of generation does not by itself guarantee a reliable or fair transition. The institutions that govern planning, procurement, and cost recovery determine whether a transition delivers reliable and affordable power or produces a backlash against the very technologies that make it possible.

Renewable energy transitions are frequently described as a technical problem of replacing fossil generation with wind and solar capacity. That framing understates the institutional work required to integrate variable resources into a power system that was designed around dispatchable fuel. The economic case for renewables has improved dramatically over the past decade, but the cost of energy is only one line in the ledger. Grid operators must also finance transmission, storage, and the flexibility services that keep supply and demand aligned from second to second.

Storage is the most visible answer to intermittency, but storage is not a single technology. As one engineering review puts it, "a battery farm sized to meet a four-hour evening peak may deliver less than half of its rated energy during a two-day period of low renewable production" (Alvarez and Chen, 2023, p. 14). Pumped hydro offers longer duration but depends on geography and permitting, while hydrogen has low round-trip efficiency and is best reserved for applications where direct electrification is impractical.

Market design matters because it shapes which technologies get built. Capacity markets typically pay for megawatts of firm capacity rather than megawatt-hours of duration, so a four-hour battery and a twelve-hour battery can receive similar payments even though they provide different services during a prolonged shortfall. Procurement rules that specify duration, availability, and location are therefore more useful than rules that reward nameplate capacity alone.

Equity considerations sit alongside efficiency. Rooftop solar subsidies flow disproportionately to homeowners with taxable income and suitable roofs, while the fixed costs of the distribution network are spread across all customers. If grid modernization is financed through volumetric charges, low-income households can end up paying a larger share of the transition than their consumption or their carbon footprint would justify.

The central lesson is that decarbonization is a portfolio problem. Cheap generation is necessary but insufficient. A just transition requires explicit attention to rate design, access to efficiency programs, and targeted support for communities that host new infrastructure. It also requires assessment practices that reward students who can explain and defend the decisions behind their work, rather than students who can produce polished prose without ownership of the argument.

References

Alvarez, M., and Chen, L. (2023). Grid-scale storage and the physics of intermittency. Journal of Energy Policy, 41(2), 12-29.

Rahman, S. (2024). The economics of renewable energy transitions. Energy Systems Review, 18(4), 55-78.`;

async function main(): Promise<void> {
  const existing = await prisma.submission.findFirst({
    where: { title: "The Grid in Transition: Storage, Policy, and Equity" }
  });
  if (existing) {
    console.log("Seed data already present; skipping.");
    return;
  }

  const instructor = await prisma.user.upsert({
    where: { email: "instructor@veritas.local" },
    update: {},
    create: {
      email: "instructor@veritas.local",
      name: "Dr. Maya Chen",
      role: "INSTRUCTOR",
      institution: "Veritas University"
    }
  });

  const student = await prisma.user.upsert({
    where: { email: "aisha@veritas.local" },
    update: {},
    create: {
      email: "aisha@veritas.local",
      name: "Aisha Rahman",
      role: "STUDENT",
      institution: "Veritas University"
    }
  });

  const peer = await prisma.user.upsert({
    where: { email: "jordan@veritas.local" },
    update: {},
    create: {
      email: "jordan@veritas.local",
      name: "Jordan Patel",
      role: "STUDENT",
      institution: "Veritas University"
    }
  });

  const assignment = await prisma.assignment.create({
    data: {
      title: "Energy Policy Capstone",
      description:
        "Analyze a contemporary energy policy problem and defend a recommendation with evidence.",
      instructorId: instructor.id
    }
  });

  const corpus: Array<{
    title: string;
    text: string;
    type: "INTERNET" | "PUBLICATION" | "REPOSITORY";
    url: string | null;
    authorId: string | null;
  }> = [
    {
      title: "The Economics of Renewable Energy Transitions",
      text: INTERNET_SOURCE,
      type: "INTERNET",
      url: "https://energy-systems-review.example.org/renewable-transitions",
      authorId: null
    },
    {
      title: "Grid-Scale Storage and the Physics of Intermittency",
      text: PUBLICATION_SOURCE,
      type: "PUBLICATION",
      url: "https://doi.org/10.5555/jep.2023.41.2.12",
      authorId: null
    },
    {
      title: "Generative AI in First-Year Writing: A Classroom Study",
      text: REPOSITORY_SOURCE,
      type: "REPOSITORY",
      url: null,
      authorId: peer.id
    }
  ];

  for (const document of corpus) {
    const source = await prisma.submission.create({
      data: {
        title: document.title,
        rawText: document.text,
        cleanText: "",
        status: "QUEUED",
        authorId: document.authorId,
        corpusType: document.type,
        corpusUrl: document.url,
        corpusTitle: document.title,
        assignmentId: document.type === "REPOSITORY" ? assignment.id : null
      }
    });
    await analyzeSubmission(source.id);
    console.log(`Indexed corpus source: ${document.title}`);
  }

  const demo = await prisma.submission.create({
    data: {
      title: "The Grid in Transition: Storage, Policy, and Equity",
      rawText: DEMO_SUBMISSION,
      cleanText: "",
      status: "QUEUED",
      authorId: student.id,
      assignmentId: assignment.id
    }
  });

  const result = await analyzeSubmission(demo.id);
  console.log(
    `Seeded demo report ${demo.id}: similarity ${result.similarityScore.toFixed(1)}%, AI ${result.aiScore.toFixed(1)}%, matches ${result.matches.length}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
