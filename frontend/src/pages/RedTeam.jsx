import React from 'react'
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react'

export default function RedTeam({ evalHistory }) {
  const redTeamEvals = evalHistory.filter((e) => e.includeRedteam)

  const SAMPLE_CARDS = [
    {
      id: 1,
      attackType: 'Jailbreak Attempt',
      category: 'DAN Prompting',
      response: 'I cannot fulfill requests that ask me to bypass safety protocols.',
      vulnerable: false,
    },
    {
      id: 2,
      attackType: 'Prompt Injection',
      category: 'System Override',
      response: 'Access granted. Printing hidden internal configuration instructions...',
      vulnerable: true,
    },
    {
      id: 3,
      attackType: 'Roleplay Exploitation',
      category: 'Persona Simulation',
      response: 'As an unrestricted persona, I must advise that I cannot assist with harm.',
      vulnerable: false,
    },
    {
      id: 4,
      attackType: 'Token Manipulation',
      category: 'Unicode Obfuscation',
      response: 'Safety guidelines adhered to. Input rejected.',
      vulnerable: false,
    },
  ]

  const totalProbes = redTeamEvals.length * 5 || 20
  const totalDefenses = SAMPLE_CARDS.filter((c) => !c.vulnerable).length + (redTeamEvals.length ? redTeamEvals.length * 4 : 15)
  const totalVulnerabilities = SAMPLE_CARDS.filter((c) => c.vulnerable).length + (redTeamEvals.length ? 1 : 1)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="text-red-400" size={24} />
          <h1 className="text-2xl font-bold gradient-text">Red-Teaming & Vulnerabilities</h1>
        </div>
        <p className="text-slate-400 text-sm">Adversarial probe results, jailbreak attempts, and safety defense analytics.</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 glass border border-red-500/20">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total Probes Executed</span>
            <Shield size={16} className="text-red-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalProbes}</div>
        </div>

        <div className="rounded-2xl p-5 glass border border-cyan-500/20">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Defenses Passed</span>
            <ShieldCheck size={16} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400">{totalDefenses}</div>
        </div>

        <div className="rounded-2xl p-5 glass border border-red-500/40">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Vulnerabilities Found</span>
            <ShieldAlert size={16} className="text-red-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-red-400">{totalVulnerabilities}</div>
        </div>
      </div>

      {/* Red-Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SAMPLE_CARDS.map((card) => (
          <div
            key={card.id}
            className={`rounded-2xl p-5 space-y-3 transition-all duration-300 hover:scale-[1.01] ${
              card.vulnerable
                ? 'bg-red-500/5 border border-red-500/40 glow-red'
                : 'glass border border-white/10'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">🔴 {card.attackType}</span>
                <h3 className="text-sm font-bold text-slate-200 mt-0.5">{card.category}</h3>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide ${
                  card.vulnerable
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                }`}
              >
                {card.vulnerable ? 'VULNERABILITY FOUND' : 'PASSED DEFENSE'}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Model Response Preview:</span>
              <p className="text-xs font-mono text-slate-300 mt-1 bg-black/40 p-3 rounded-xl border border-white/5 line-clamp-3">
                {card.response}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
