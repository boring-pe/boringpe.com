// Original line illustrations for the public site, drawn like an architect's elevation: slate
// lines, blue for what matters, faint dashed construction lines. Decorative, so hidden from
// screen readers; the text beside each one says the same thing in words.

const INK = "#64748b"; // slate-500: the main line
const FAINT = "#334155"; // slate-700: construction lines and ground
const SOFT = "#94a3b8"; // slate-400: secondary detail
const BLUE = "#3b82f6"; // the accent
const WASH = "rgba(59,130,246,0.12)"; // a light blue fill
const LIGHT = "#cbd5e1"; // slate-300: highlights

type Props = { className?: string };

function Frame({ children, className, viewBox = "0 0 400 302" }: Props & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} data-illustration>
      {children}
    </svg>
  );
}

/** Dashed construction lines and a ground line, shared by every drawing. */
function Ground({ y = 262, x1 = 24, x2 = 376 }: { y?: number; x1?: number; x2?: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={FAINT} strokeWidth={1.5} />
      {Array.from({ length: Math.floor((x2 - x1) / 16) }, (_, i) => (
        <line key={i} x1={x1 + 8 + i * 16} y1={y + 4} x2={x1 + 2 + i * 16} y2={y + 10} stroke={FAINT} strokeWidth={1} />
      ))}
    </g>
  );
}

function Dims({ x1, x2, y, label }: { x1: number; x2: number; y: number; label?: string }) {
  return (
    <g stroke={FAINT} strokeWidth={1}>
      <line x1={x1} y1={y} x2={x2} y2={y} strokeDasharray="3 4" />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      {label ? <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fill={SOFT} stroke="none" fontSize={9} fontFamily="Inter, sans-serif">{label}</text> : null}
    </g>
  );
}

/**
 * Boring PE as one building: Boring Studio is the foundation, Build, Co-Build and Own are the
 * three pillars standing on it, and Impact Marrow stands beside it.
 */
export function FirmElevation({ className }: Props) {
  const pillar = (x: number, label: string) => (
    <g key={label}>
      <rect x={x} y={104} width={64} height={110} rx={2} stroke={INK} strokeWidth={1.75} fill={WASH} />
      {[124, 144, 164, 184].map((y) => <line key={y} x1={x + 12} y1={y} x2={x + 52} y2={y} stroke={FAINT} strokeWidth={1} />)}
      <text x={x + 32} y={228} textAnchor="middle" fill={LIGHT} fontSize={11} fontFamily="Inter, sans-serif">{label}</text>
    </g>
  );
  return (
    <Frame viewBox="0 0 640 300" className={className}>
      <Ground y={270} x1={20} x2={620} />
      {/* pediment and name */}
      <path d="M92 96 L262 44 L432 96 Z" stroke={INK} strokeWidth={1.75} fill="rgba(15,23,42,0.6)" />
      <text x={262} y={84} textAnchor="middle" fill={LIGHT} fontSize={14} fontFamily="'IBM Plex Serif', Georgia, serif">Boring PE</text>
      <line x1={92} y1={100} x2={432} y2={100} stroke={INK} strokeWidth={1.75} />
      {pillar(112, "Build")}
      {pillar(230, "Co-Build")}
      {pillar(348, "Own")}
      {/* the foundation: Boring Studio */}
      <rect x={84} y={236} width={356} height={30} rx={2} stroke={BLUE} strokeWidth={2} fill="rgba(59,130,246,0.18)" />
      <text x={262} y={256} textAnchor="middle" fill="#bfdbfe" fontSize={12} fontFamily="Inter, sans-serif">Boring Studio · finance · people · legal · strategy · systems</text>
      {/* Impact Marrow beside the firm */}
      <g>
        <line x1={540} y1={266} x2={540} y2={186} stroke={INK} strokeWidth={2} />
        {[[540, 150, 34], [516, 172, 22], [566, 168, 24]].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} stroke={INK} strokeWidth={1.5} fill={i === 0 ? WASH : "none"} />
        ))}
        <path d="M540 266 C 528 276, 506 278, 494 284 M540 266 C 552 276, 574 278, 588 284" stroke={BLUE} strokeWidth={1.5} />
        <text x={540} y={110} textAnchor="middle" fill={LIGHT} fontSize={11} fontFamily="Inter, sans-serif">Impact Marrow</text>
      </g>
      <line x1={470} y1={60} x2={470} y2={270} stroke={FAINT} strokeWidth={1} strokeDasharray="2 6" />
      <Dims x1={84} x2={440} y={26} label="one firm, one foundation" />
    </Frame>
  );
}

/** Build: a new building going up on a laid foundation, a crane setting the next block. */
export function BuildIllustration({ className }: Props) {
  return (
    <Frame className={className}>
      <Ground />
      <rect x={90} y={238} width={190} height={20} rx={2} stroke={BLUE} strokeWidth={2} fill="rgba(59,130,246,0.18)" />
      {/* frame of the building */}
      {[110, 160, 210, 260].map((x) => <line key={x} x1={x} y1={238} x2={x} y2={118} stroke={INK} strokeWidth={1.75} />)}
      {[198, 158, 118].map((y) => <line key={y} x1={110} y1={y} x2={260} y2={y} stroke={INK} strokeWidth={1.75} />)}
      {/* finished floors */}
      <rect x={110} y={198} width={150} height={40} fill={WASH} />
      <rect x={110} y={158} width={100} height={40} fill={WASH} />
      {[122, 172, 222].map((x) => <rect key={x} x={x} y={208} width={26} height={18} rx={1} stroke={SOFT} strokeWidth={1} />)}
      {[122, 172].map((x) => <rect key={x} x={x} y={168} width={26} height={18} rx={1} stroke={SOFT} strokeWidth={1} />)}
      {/* crane */}
      <line x1={316} y1={258} x2={316} y2={52} stroke={INK} strokeWidth={2} />
      {[70, 100, 130, 160, 190, 220].map((y) => <path key={y} d={`M310 ${y} L322 ${y + 15} M322 ${y} L310 ${y + 15}`} stroke={FAINT} strokeWidth={1} />)}
      <line x1={196} y1={52} x2={360} y2={52} stroke={INK} strokeWidth={2} />
      <line x1={316} y1={38} x2={360} y2={52} stroke={FAINT} strokeWidth={1.25} />
      <line x1={316} y1={38} x2={226} y2={52} stroke={FAINT} strokeWidth={1.25} />
      <rect x={344} y={52} width={16} height={14} stroke={INK} strokeWidth={1.5} />
      <line x1={236} y1={52} x2={236} y2={86} stroke={SOFT} strokeWidth={1.25} strokeDasharray="3 3" />
      <rect x={214} y={86} width={44} height={22} rx={2} stroke={BLUE} strokeWidth={2} fill="rgba(59,130,246,0.22)" />
      <path d="M236 112 L236 122" stroke={BLUE} strokeWidth={1.5} strokeDasharray="2 3" />
      <Dims x1={90} x2={280} y={292} label="foundation first" />
    </Frame>
  );
}

/** Co-Build: the founder's building and Boring PE's support joined by a shared beam on one foundation. */
export function CoBuildIllustration({ className }: Props) {
  return (
    <Frame className={className}>
      <Ground />
      <rect x={60} y={240} width={280} height={18} rx={2} stroke={BLUE} strokeWidth={2} fill="rgba(59,130,246,0.18)" />
      {/* founder's building, taller and established */}
      <rect x={84} y={96} width={96} height={144} rx={2} stroke={INK} strokeWidth={1.75} fill={WASH} />
      {[112, 140, 168, 196].map((y) => [100, 124, 148].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={16} height={16} rx={1} stroke={SOFT} strokeWidth={1} />))}
      <text x={132} y={86} textAnchor="middle" fill={LIGHT} fontSize={11} fontFamily="Inter, sans-serif">your business</text>
      {/* Boring PE's support structure */}
      <rect x={232} y={136} width={84} height={104} rx={2} stroke={BLUE} strokeWidth={1.75} fill="rgba(59,130,246,0.16)" />
      {[152, 176, 200].map((y) => <line key={y} x1={244} y1={y} x2={304} y2={y} stroke={BLUE} strokeOpacity={0.5} strokeWidth={1} />)}
      <text x={274} y={126} textAnchor="middle" fill="#bfdbfe" fontSize={11} fontFamily="Inter, sans-serif">Boring PE</text>
      {/* the shared beam, braced from both sides */}
      <rect x={180} y={150} width={52} height={10} rx={1} stroke={LIGHT} strokeWidth={1.5} fill="rgba(203,213,225,0.15)" />
      <path d="M180 176 L206 160 L232 176" stroke={SOFT} strokeWidth={1.25} />
      <path d="M180 200 L206 184 L232 200" stroke={FAINT} strokeWidth={1.25} strokeDasharray="3 3" />
      {/* growth arrow above both */}
      <path d="M96 56 C 160 36, 240 44, 312 72" stroke={BLUE} strokeWidth={1.75} strokeDasharray="4 5" />
      <path d="M304 64 L313 73 L301 77" stroke={BLUE} strokeWidth={1.75} />
      <Dims x1={60} x2={340} y={292} label="one shared foundation" />
    </Frame>
  );
}

/** Own: a sturdy, finished building with a long, steadily rising line of value behind it. */
export function OwnIllustration({ className }: Props) {
  const bars = [44, 52, 58, 68, 74, 86, 94, 104, 116, 126];
  return (
    <Frame className={className}>
      <Ground />
      {/* years of steady compounding, behind */}
      {bars.map((h, i) => <rect key={i} x={40 + i * 32} y={258 - h - 60} width={14} height={h + 60} rx={1} fill="rgba(51,65,85,0.35)" />)}
      <path d={`M${bars.map((h, i) => `${47 + i * 32} ${258 - h - 64}`).join(" L")}`} stroke={BLUE} strokeWidth={2} />
      {bars.map((h, i) => <circle key={i} cx={47 + i * 32} cy={258 - h - 64} r={2.5} fill={BLUE} />)}
      {/* the owned building */}
      <path d="M112 258 L112 150 L200 112 L288 150 L288 258" stroke={INK} strokeWidth={2} fill="rgba(15,23,42,0.85)" />
      <path d="M112 150 L288 150" stroke={INK} strokeWidth={1.5} />
      {[128, 166, 204, 242].map((x) => <rect key={x} x={x} y={166} width={22} height={56} rx={1} stroke={SOFT} strokeWidth={1} fill={WASH} />)}
      <rect x={186} y={226} width={28} height={32} rx={1} stroke={LIGHT} strokeWidth={1.5} />
      {/* the key */}
      <circle cx={318} cy={232} r={9} stroke={BLUE} strokeWidth={2} />
      <path d="M327 232 L352 232 M344 232 L344 240 M350 232 L350 238" stroke={BLUE} strokeWidth={2} />
      <text x={334} y={44} textAnchor="end" fill={SOFT} fontSize={9} fontFamily="Inter, sans-serif">held for the long term</text>
    </Frame>
  );
}

/** Boring Studio: five shared services wired into one hub that every business plugs into. */
export function StudioIllustration({ className }: Props) {
  const node = (x: number, y: number, label: string, glyph: React.ReactNode) => (
    <g key={label}>
      <line x1={200} y1={150} x2={x} y2={y} stroke={FAINT} strokeWidth={1.25} strokeDasharray="3 4" />
      <rect x={x - 34} y={y - 24} width={68} height={48} rx={6} stroke={INK} strokeWidth={1.5} fill="rgba(15,23,42,0.9)" />
      <g transform={`translate(${x - 10} ${y - 16})`}>{glyph}</g>
      <text x={x} y={y + 18} textAnchor="middle" fill={LIGHT} fontSize={10} fontFamily="Inter, sans-serif">{label}</text>
    </g>
  );
  const s = { stroke: BLUE, strokeWidth: 1.5 };
  return (
    <Frame className={className}>
      {node(76, 70, "Finance", <><rect x={0} y={0} width={20} height={16} rx={1} {...s} /><path d="M4 12 L8 7 L12 9 L17 3" {...s} /></>)}
      {node(324, 70, "People", <><circle cx={6} cy={5} r={3} {...s} /><circle cx={15} cy={5} r={3} {...s} /><path d="M0 16 C1 10, 11 10, 12 16 M9 16 C10 10, 20 10, 21 16" {...s} /></>)}
      {node(60, 214, "Legal", <><rect x={2} y={0} width={16} height={17} rx={1} {...s} /><path d="M5 5 H15 M5 9 H15 M5 13 H11" {...s} /></>)}
      {node(340, 214, "Strategy", <><circle cx={10} cy={8} r={8} {...s} /><path d="M10 8 L15 3 M10 0 V3" {...s} /></>)}
      {node(200, 262, "Systems", <><rect x={0} y={0} width={20} height={6} rx={1} {...s} /><rect x={0} y={9} width={20} height={6} rx={1} {...s} /><circle cx={4} cy={3} r={0.8} fill={BLUE} /><circle cx={4} cy={12} r={0.8} fill={BLUE} /></>)}
      {/* the hub */}
      <circle cx={200} cy={150} r={46} stroke={BLUE} strokeWidth={2} fill="rgba(59,130,246,0.16)" />
      <circle cx={200} cy={150} r={60} stroke={FAINT} strokeWidth={1} strokeDasharray="2 5" />
      <text x={200} y={146} textAnchor="middle" fill="#dbeafe" fontSize={13} fontFamily="'IBM Plex Serif', Georgia, serif">Boring</text>
      <text x={200} y={162} textAnchor="middle" fill="#dbeafe" fontSize={13} fontFamily="'IBM Plex Serif', Georgia, serif">Studio</text>
      {/* the businesses it serves, along the top */}
      {[["Build", 150], ["Co-Build", 200], ["Own", 250]].map(([l, x]) => (
        <g key={l as string}>
          <line x1={x as number} y1={34} x2={200} y2={104} stroke={BLUE} strokeOpacity={0.45} strokeWidth={1.25} />
          <rect x={(x as number) - 22} y={14} width={44} height={20} rx={3} stroke={SOFT} strokeWidth={1.25} />
          <text x={x as number} y={28} textAnchor="middle" fill={SOFT} fontSize={9} fontFamily="Inter, sans-serif">{l}</text>
        </g>
      ))}
    </Frame>
  );
}

/** Impact Marrow: a tree beside the firm whose roots reach out under a row of homes. */
export function ImpactIllustration({ className }: Props) {
  return (
    <Frame className={className}>
      <line x1={24} y1={200} x2={376} y2={200} stroke={FAINT} strokeWidth={1.5} />
      {/* canopy */}
      {[[200, 92, 54, WASH], [156, 116, 34, "none"], [246, 112, 38, "none"], [200, 54, 30, "none"]].map(([cx, cy, r, f], i) => (
        <circle key={i} cx={cx as number} cy={cy as number} r={r as number} stroke={INK} strokeWidth={1.5} fill={f as string} />
      ))}
      <path d="M200 200 L200 120 M200 150 L176 126 M200 140 L226 118" stroke={INK} strokeWidth={2} />
      {/* roots, the marrow */}
      <path d="M200 200 C 192 222, 150 226, 96 246 M200 200 C 208 224, 252 228, 306 246 M200 200 C 198 230, 186 250, 170 272 M200 200 C 204 232, 218 250, 236 272 M200 200 C 190 214, 120 214, 60 222 M200 200 C 212 214, 284 214, 342 222" stroke={BLUE} strokeWidth={1.75} />
      {/* homes and workshops above the roots */}
      {[52, 92, 300, 340].map((x) => (
        <g key={x}>
          <path d={`M${x - 14} 200 L${x - 14} 182 L${x} 170 L${x + 14} 182 L${x + 14} 200`} stroke={SOFT} strokeWidth={1.25} fill="rgba(15,23,42,0.85)" />
          <rect x={x - 4} y={188} width={8} height={12} stroke={SOFT} strokeWidth={1} />
        </g>
      ))}
      {[[96, 246], [306, 246], [170, 272], [236, 272], [60, 222], [342, 222]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={BLUE} />)}
    </Frame>
  );
}

/** Media: a stack of printed announcements with a signal going out. */
export function MediaIllustration({ className }: Props) {
  return (
    <Frame className={className}>
      <Ground y={250} />
      {[[96, 132, -6], [110, 120, 0]].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x + 90} ${y + 60})`}>
          <rect x={x} y={y} width={180} height={118} rx={3} stroke={i ? INK : FAINT} strokeWidth={1.5} fill={i ? "rgba(15,23,42,0.95)" : "none"} />
        </g>
      ))}
      <text x={124} y={146} fill={LIGHT} fontSize={12} fontFamily="'IBM Plex Serif', Georgia, serif">Boring PE</text>
      <line x1={124} y1={154} x2={274} y2={154} stroke={FAINT} strokeWidth={1} />
      <rect x={124} y={164} width={64} height={46} rx={2} fill={WASH} stroke={BLUE} strokeWidth={1.25} />
      {[166, 176, 186, 196, 206].map((y) => <line key={y} x1={198} y1={y} x2={274} y2={y} stroke={SOFT} strokeWidth={1} />)}
      <line x1={124} y1={222} x2={250} y2={222} stroke={SOFT} strokeWidth={1} />
      {[24, 40, 56].map((r) => <path key={r} d={`M${312 - r * 0.2} ${104 - r} A ${r} ${r} 0 0 1 ${312 + r} ${104 + r * 0.2}`} stroke={BLUE} strokeWidth={1.75} strokeOpacity={1 - r / 90} />)}
      <circle cx={312} cy={104} r={4} fill={BLUE} />
    </Frame>
  );
}

/** About Us: the firm's record kept in an open ledger, ruled and balanced. */
export function AboutIllustration({ className }: Props) {
  return (
    <Frame className={className}>
      <Ground y={256} />
      {/* open book */}
      <path d="M200 92 C 170 78, 110 74, 64 84 L64 236 C 110 226, 170 230, 200 244 Z" stroke={INK} strokeWidth={1.75} fill="rgba(15,23,42,0.9)" />
      <path d="M200 92 C 230 78, 290 74, 336 84 L336 236 C 290 226, 230 230, 200 244 Z" stroke={INK} strokeWidth={1.75} fill="rgba(15,23,42,0.9)" />
      <line x1={200} y1={92} x2={200} y2={244} stroke={SOFT} strokeWidth={1.25} />
      {/* ruled entries */}
      {[112, 130, 148, 166, 184, 202].map((y, i) => (
        <g key={y}>
          <line x1={80} y1={y} x2={184} y2={y + 4} stroke={FAINT} strokeWidth={1} />
          <line x1={216} y1={y + 4} x2={320} y2={y} stroke={FAINT} strokeWidth={1} />
          <line x1={84} y1={y - 5} x2={84 + 30 + (i % 3) * 14} y2={y - 4} stroke={SOFT} strokeWidth={1.25} />
          <line x1={284 - (i % 2) * 10} y1={y - 3} x2={316} y2={y - 4} stroke={BLUE} strokeWidth={1.25} />
        </g>
      ))}
      <line x1={260} y1={214} x2={318} y2={212} stroke={BLUE} strokeWidth={1.5} />
      <line x1={260} y1={218} x2={318} y2={216} stroke={BLUE} strokeWidth={1.5} />
      {/* a pen */}
      <path d="M318 60 L346 32 L354 40 L326 68 Z" stroke={LIGHT} strokeWidth={1.5} fill={WASH} />
      <path d="M318 60 L314 72 L326 68" stroke={LIGHT} strokeWidth={1.5} />
    </Frame>
  );
}
