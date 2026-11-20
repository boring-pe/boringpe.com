import React from "react";
import {
  Building2,
  Handshake,
  Landmark,
  Layers,
  ArrowRight,
  ShieldCheck,
  GitBranch,
  BookOpen,
  Search,
  FlaskConical,
} from "lucide-react";

const pillars = [
  {
    id: "build",
    code: "2.1",
    title: "BUILD",
    name: "Independent Business Building",
    icon: Building2,
    role: "Boring PE takes the initiative to develop businesses, determines their appropriate operating and ownership structures, and drives their development.",
    summary:
      "Boring PE identifies opportunities, develops business concepts, validates business models and establishes enterprises based on market needs and business fundamentals.",
    activities: [
      "Opportunity identification and evaluation",
      "Market research and feasibility assessment",
      "Business concept and model development",
      "Venture creation and establishment",
      "Product and service development",
      "Business launch and market entry",
      "Business growth and scaling",
    ],
  },
  {
    id: "cobuild",
    code: "2.2",
    title: "CO-BUILD",
    name: "Collaborative Business Building",
    icon: Handshake,
    role: "Boring PE contributes its business-building capabilities and participates in collaborative development. Ownership, governance, responsibilities, contributions and commercial arrangements are defined according to each partnership.",
    summary:
      "Boring PE works with founders, entrepreneurs, corporates, institutions, investors and other partners to combine complementary resources, expertise, networks, capabilities and opportunities.",
    activities: [
      "Founder and entrepreneur partnerships",
      "Joint business development",
      "Joint ventures and strategic collaborations",
      "Corporate and institutional partnerships",
      "Collaborative venture development",
      "Business development and implementation partnerships",
      "Partner-led business and programme development",
    ],
  },
  {
    id: "own",
    code: "2.3",
    title: "OWN",
    name: "Ownership & Investment",
    icon: Landmark,
    role: "Boring PE evaluates opportunities, participates in ownership and contributes to the long-term development of its business interests. Involvement depends on the ownership structure, governance rights and investment arrangements.",
    summary:
      "Identifying, developing and holding business interests that align with Boring PE's strategic direction and long-term value creation objectives.",
    activities: [
      "Strategic business investments",
      "Equity and ownership participation",
      "Business acquisitions",
      "Development of owned business interests",
      "Portfolio oversight and value creation",
      "Long-term business development and ownership",
    ],
  },
  {
    id: "enable",
    code: "2.4",
    title: "ENABLE",
    name: "Enterprise Enablement & Development",
    icon: Layers,
    role: "Boring PE develops and provides the institutional infrastructure and capabilities required to support enterprise creation, collaboration, ownership and growth.",
    summary:
      "The institutional, operational, intellectual and organisational capabilities that strengthen Boring PE and its business ecosystem. ENABLE operates through Business House.",
    activities: [
      "Enterprise operations and management support",
      "Business ecosystem coordination",
      "Shared operational infrastructure",
      "Organisational and institutional development",
      "Capability and knowledge development",
      "Business intelligence and research",
      "Research and development",
      "Systems, processes and continuous improvement",
    ],
  },
];

const principles = [
  ["Business Fundamentals", "Prioritising sound economics, market demand and operational feasibility."],
  ["Multiple Pathways", "Creating and participating in businesses through independent, collaborative and ownership-led approaches."],
  ["Strategic Collaboration", "Combining complementary capabilities and resources through structured partnerships."],
  ["Long-Term Ownership", "Building enduring business interests and sustainable economic value."],
  ["Institutional Strength", "Developing systems, processes, knowledge and capabilities that reduce dependence on individuals."],
  ["Operational Discipline", "Establishing accountability, performance measurement and continuous improvement."],
  ["Adaptability", "Remaining open to new business models, sectors, technologies and opportunities."],
];

const steps = ["Identify", "Develop", "Build", "Collaborate", "Own", "Enable", "Improve", "Grow"];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-blue-900 selection:text-white">
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-500" />
            <span className="text-xl font-bold tracking-tight text-white">BORING PE</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#framework" className="hover:text-white transition-colors">Framework</a>
            <a href="#pillars" className="hover:text-white transition-colors">Pillars</a>
            <a href="#house" className="hover:text-white transition-colors">Business House</a>
            <a href="#principles" className="hover:text-white transition-colors">Principles</a>
          </div>
          <a
            href="https://portal.boringpe.com"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-all flex items-center gap-2"
          >
            Portal Login <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>

      <section id="top" className="pt-32 pb-20 md:pt-44 md:pb-28 px-6 border-b border-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-blue-400 mb-5">
            Private Enterprise · Business Studio
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
            Unconventional Business Building Framework
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-4">
            Building, Collaborating, Owning & Enabling Enterprises
          </p>
          <p className="text-base md:text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            The integrated approach through which Boring PE identifies opportunities, creates businesses, collaborates with entrepreneurs and institutions, participates in ownership, and develops the capabilities and infrastructure required to strengthen enterprises.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#pillars" className="px-8 py-4 bg-white text-slate-950 font-semibold rounded-md hover:bg-slate-200 transition-colors w-full sm:w-auto">
              The Four Pillars
            </a>
            <a href="#house" className="px-8 py-4 bg-slate-900 border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-800 transition-colors w-full sm:w-auto">
              Business House
            </a>
          </div>
        </div>
      </section>

      <section id="framework" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">01 — Introduction</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">One framework. Several ways to build.</h2>
          <div className="space-y-5 text-slate-400 leading-relaxed">
            <p>
              Unlike conventional business models that focus on a single activity such as venture creation, investment, consulting or business operations, Boring PE brings multiple dimensions of enterprise development together under one framework.
            </p>
            <p>
              The framework recognises that businesses can be created through independent initiatives, collaborative partnerships and ownership participation. It also recognises that sustainable enterprises require institutional capabilities, operational systems, knowledge, intelligence and continuous development.
            </p>
            <p>
              Through this framework, Boring PE seeks to build and develop profitable, viable, feasible, scalable, sustainable and resilient businesses across sectors.
            </p>
          </div>
        </div>
      </section>

      <section id="pillars" className="py-8 px-6 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">02 — The Four Pillars</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Interconnected, not separate divisions.</h2>
            <p className="text-slate-400 leading-relaxed">
              The pillars can operate independently or in combination, depending on the nature of an opportunity.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article key={pillar.id} id={pillar.id} className="p-8 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-blue-400">{pillar.code}</p>
                      <h3 className="mt-1 text-2xl font-bold text-white">{pillar.title}</h3>
                      <p className="text-sm text-slate-400">{pillar.name}</p>
                    </div>
                    <Icon className="w-8 h-8 text-blue-500 shrink-0" />
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed mb-5">{pillar.summary}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Key activities</p>
                  <ul className="space-y-2 mb-6">
                    {pillar.activities.map((activity) => (
                      <li key={activity} className="text-sm text-slate-400 flex gap-2">
                        <span className="mt-2 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                        {activity}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-slate-400 leading-relaxed border-t border-slate-800 pt-5">
                    <span className="text-white font-medium">Role of Boring PE. </span>
                    {pillar.role}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="house" className="py-24 px-6 bg-slate-900/40 border-y border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">03 — Business House</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">The managing and enabling infrastructure.</h2>
            <p className="text-slate-400 leading-relaxed">
              Business House is the institutional backbone supporting the ENABLE pillar. It develops and maintains the management systems, operational capabilities, knowledge resources and intelligence infrastructure required for Boring PE and its wider business ecosystem. It operates through two specialised units.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <article className="p-8 bg-slate-950 border border-slate-800 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-blue-500 mb-5" />
              <p className="text-xs font-semibold tracking-wide text-blue-400">3.1</p>
              <h3 className="mt-1 text-2xl font-bold text-white">Business Management Unit</h3>
              <p className="text-sm text-slate-400 mb-6">BMU — Enterprise Operations & Management</p>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                BMU manages Boring PE's internal corporate operations and provides agreed operational support to its business ecosystem. The extent of involvement depends on ownership structures, partnership agreements, governance rights and defined responsibilities.
              </p>
              <h4 className="text-sm font-semibold text-white mb-3">Core Operations — Boring PE</h4>
              <ul className="space-y-2 mb-6">
                {[
                  "Enterprise strategy coordination and business planning",
                  "Corporate administration and internal management",
                  "Finance, accounts, budgeting and financial controls",
                  "Human resource management and talent administration",
                  "Legal coordination, governance and compliance",
                  "Technology infrastructure, systems and automation",
                  "Internal project and workflow management",
                  "Corporate communications and organisational coordination",
                ].map((item) => (
                  <li key={item} className="text-sm text-slate-400">{item}</li>
                ))}
              </ul>
              <h4 className="text-sm font-semibold text-white mb-3">Ecosystem Operations — Businesses & Partners</h4>
              <ul className="space-y-2">
                {[
                  "Operational support to BUILD businesses",
                  "Operational coordination for CO-BUILD ventures and partnerships",
                  "Portfolio operations and management support for OWN businesses",
                  "Shared operational resources and infrastructure",
                  "Partner and associate coordination",
                  "Business performance monitoring and reporting",
                  "Implementation and execution support",
                ].map((item) => (
                  <li key={item} className="text-sm text-slate-400">{item}</li>
                ))}
              </ul>
            </article>

            <article className="p-8 bg-slate-950 border border-slate-800 rounded-xl">
              <BookOpen className="w-8 h-8 text-blue-500 mb-5" />
              <p className="text-xs font-semibold tracking-wide text-blue-400">3.2</p>
              <h3 className="mt-1 text-2xl font-bold text-white">Business Intelligence & Development Unit</h3>
              <p className="text-sm text-slate-400 mb-6">BIDU — Intelligence, Capability Development & Innovation</p>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                BIDU develops the knowledge, intelligence, organisational capabilities and innovative approaches required to strengthen Boring PE and its business ecosystem.
              </p>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-white">Capability & Knowledge Development</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Playbooks, frameworks, SOPs, policies, Academy and learning, founder and team development, knowledge management, and business-building capabilities.
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-white">Business Intelligence & Research</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Market and industry research, opportunity identification, competitive intelligence, feasibility studies, analytics, strategic research, investment and acquisition research, and decision support.
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FlaskConical className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-white">Research & Development</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    New business models, product and service innovation, technology exploration, process innovation, new frameworks and tools, model testing, and continuous improvement.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="together" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-10">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">04 — How the pillars work together</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Different stages. One foundation.</h2>
            <p className="text-slate-400 leading-relaxed">
              An opportunity identified by Boring PE may be developed independently under BUILD, developed with a strategic partner under CO-BUILD, and held under OWN. ENABLE provides the operational infrastructure, knowledge, intelligence and capabilities that support its development.
            </p>
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Pillar</th>
                  <th className="px-6 py-4 font-medium">Primary function</th>
                  <th className="px-6 py-4 font-medium">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["BUILD", "Independent business building", "Creates businesses"],
                  ["CO-BUILD", "Collaborative business building", "Develops businesses with partners"],
                  ["OWN", "Ownership and investment", "Establishes and develops ownership interests"],
                  ["ENABLE", "Enterprise enablement and development", "Provides capabilities and infrastructure"],
                ].map((row) => (
                  <tr key={row[0]} className="border-t border-slate-800">
                    <td className="px-6 py-4 font-semibold text-white">{row[0]}</td>
                    <td className="px-6 py-4 text-slate-300">{row[1]}</td>
                    <td className="px-6 py-4 text-slate-400">{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="philosophy" className="py-20 px-6 bg-slate-900/40 border-y border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-blue-400 mb-3">
            <GitBranch className="w-4 h-4" />
            <p className="text-xs font-semibold tracking-[0.18em] uppercase">05 — Operating philosophy</p>
          </div>
          <h2 className="text-3xl font-bold text-white mb-8">Not every business passes through every stage.</h2>
          <div className="flex flex-wrap gap-3">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span className="px-4 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm font-medium text-white">
                  {step}
                </span>
                {index < steps.length - 1 && <span className="text-slate-600">→</span>}
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-slate-400 leading-relaxed">
            The appropriate pathway depends on the opportunity, strategic objectives, resources, partners and business model. The framework provides flexibility in how Boring PE creates and participates in businesses while maintaining a common institutional foundation.
          </p>
        </div>
      </section>

      <section id="principles" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">06 — Guiding principles</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-10">How decisions are made.</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {principles.map(([title, detail]) => (
              <div key={title} className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="outcome" className="py-24 px-6 bg-blue-950/20 border-y border-slate-800">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">07 — Intended outcome</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">A diversified private enterprise.</h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            The long-term objective is to build a diversified, professionally managed Private Enterprise capable of developing enduring businesses across sectors.
          </p>
          <ul className="space-y-3 text-slate-300">
            {[
              "Independently create businesses.",
              "Collaboratively develop businesses with external stakeholders.",
              "Invest in, acquire and hold ownership interests.",
              "Establish shared institutional and operational infrastructure.",
              "Develop organisational capabilities, intelligence and knowledge.",
              "Strengthen businesses through continuous improvement and innovation.",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">08 — Framework summary</p>
          <h2 className="text-3xl font-bold text-white">Powering the Business Stack.</h2>
          <p className="mt-4 text-slate-400">We Do Business by Powering the Business Stack.</p>
          <p className="mt-8 text-sm text-slate-500">
            BORING PE · Private Enterprise · Business Studio · BUILD · CO-BUILD · OWN · ENABLE · Business House
          </p>
        </div>
      </section>

      <footer className="py-16 px-6 bg-slate-950 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-6 h-6 text-blue-500" />
              <span className="text-lg font-bold text-white">BORING PE</span>
            </div>
            <p className="text-slate-500 text-sm max-w-sm mb-6">
              A private enterprise that builds, collaborates, owns and enables businesses. Powering the Business Stack.
            </p>
            <p className="text-slate-600 text-xs">© 2026 Boring PE. All Rights Reserved.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Framework</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="#pillars" className="hover:text-white transition-colors">Four Pillars</a></li>
              <li><a href="#house" className="hover:text-white transition-colors">Business House</a></li>
              <li><a href="#principles" className="hover:text-white transition-colors">Principles</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Internal</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="https://portal.boringpe.com" className="hover:text-white transition-colors">Boring Portal Login</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
