import { requireSection } from "@/lib/dal";
import React from 'react';
import { 
  TrendingUp, DollarSign, Building2, Target, 
  ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';

// Reusable Stat Card Component
const StatCard = ({ 
  label, value, change, changeType, icon: Icon 
}: { 
  label: string; 
  value: string; 
  change: string; 
  changeType: 'up' | 'down'; 
  icon: React.ElementType;
}) => (
  <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-blue-500/10 rounded-lg">
        <Icon className="w-5 h-5 text-blue-500" />
      </div>
      <div className={`flex items-center gap-1 text-xs font-semibold ${
        changeType === 'up' ? 'text-green-500' : 'text-red-500'
      }`}>
        {changeType === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </div>
    </div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-sm text-slate-500">{label}</div>
  </div>
);

export default async function DashboardPage() {
  await requireSection("dashboard");
  return (
    <div className="space-y-8">
      
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Portfolio Revenue (MTD)" 
          value="$142,500" 
          change="+12.4%" 
          changeType="up" 
          icon={DollarSign} 
        />
        <StatCard 
          label="MSA Fees Collected" 
          value="$8,400" 
          change="+8.2%" 
          changeType="up" 
          icon={TrendingUp} 
        />
        <StatCard 
          label="Active SPVs" 
          value="3" 
          change="+1" 
          changeType="up" 
          icon={Building2} 
        />
        <StatCard 
          label="Deals in Pipeline" 
          value="7" 
          change="-2" 
          changeType="down" 
          icon={Target} 
        />
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Portfolio Performance */}
        <div className="lg:col-span-2 p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Portfolio Performance</h2>
              <p className="text-sm text-slate-500">Revenue by SPV (Last 6 months)</p>
            </div>
            <button className="text-xs text-blue-500 hover:text-blue-400 font-medium">
              View Details →
            </button>
          </div>
          
          {/* Placeholder for Recharts graph */}
          <div className="h-64 flex items-end justify-between gap-3 px-4">
            {[45, 62, 58, 71, 68, 85].map((height, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-gradient-to-t from-blue-600 to-blue-500 rounded-t-md transition-all hover:from-blue-500 hover:to-blue-400"
                  style={{ height: `${height}%` }}
                />
                <span className="text-xs text-slate-500">
                  {['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Marrow Score */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-white">Impact Marrow</h2>
          </div>
          
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Employee Retention</span>
                <span className="text-white font-semibold">94%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '94%' }} />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Community Investment</span>
                <span className="text-white font-semibold">$4,200</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }} />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Team Satisfaction</span>
                <span className="text-white font-semibold">4.6 / 5</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '92%' }} />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 leading-relaxed">
                Impact Marrow initiatives are outperforming benchmarks across all active SPVs.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active SPVs Table */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
        <h2 className="text-lg font-semibold text-white mb-6">Active Portfolio Companies</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="pb-3 font-medium">Company</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">MSA Status</th>
                <th className="pb-3 font-medium">MRR</th>
                <th className="pb-3 font-medium">Health</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {[
                { name: 'Patient Zero Startup', type: 'CO-BUILD', msa: 'Active', mrr: '$18,400', health: 'Excellent' },
                { name: 'Acquired Logistics Co.', type: 'OWN', msa: 'Active', mrr: '$62,100', health: 'Good' },
                { name: 'Built Manufacturing LLC', type: 'BUILD', msa: 'Pending', mrr: '$12,000', health: 'Good' },
              ].map((company, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 font-medium text-white">{company.name}</td>
                  <td className="py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded">
                      {company.type}
                    </span>
                  </td>
                  <td className="py-4 text-slate-400">{company.msa}</td>
                  <td className="py-4 text-white font-medium">{company.mrr}</td>
                  <td className="py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      company.health === 'Excellent' ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        company.health === 'Excellent' ? 'bg-green-500' : 'bg-blue-500'
                      }`} />
                      {company.health}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
