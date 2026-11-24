import { HeartHandshake, ShieldCheck, TrendingUp, Users } from "lucide-react";

/** What Boring PE looks for: fundamentals over hype, and four qualities. */
export function Philosophy() {
  return (
    <section className="py-20 px-6 bg-slate-900/50">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Fundamentals Over Hype.<br/>Enduring Value Over Short-Term Trends.</h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            We believe that successful enterprises are not built through ideas alone. They require the right combination of business models, capital, people, capabilities, systems, and long-term execution.
          </p>
          <p className="text-slate-400 leading-relaxed">
            While others chase the next disruptive trend, we focus on the backbone of the economy. We identify opportunities that solve real problems, serve enduring needs, and create compounding economic value.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg">
            <TrendingUp className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-white mb-2">Profitable</h3>
            <p className="text-sm text-slate-400">Sustainable economic returns with proven cash flow.</p>
          </div>
          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg mt-8">
            <ShieldCheck className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-white mb-2">Resilient</h3>
            <p className="text-sm text-slate-400">Built to adapt and thrive in changing markets.</p>
          </div>
          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg">
            <Users className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-white mb-2">Scalable</h3>
            <p className="text-sm text-slate-400">Systems designed for operational expansion.</p>
          </div>
          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg mt-8">
            <HeartHandshake className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-white mb-2">Sustainable</h3>
            <p className="text-sm text-slate-400">Long-term relevance and community value.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
