import React from "react";

const NAVY  = "#101828";
const GREEN = "#1D9E75";
const GOLD  = "#C9A84C";

interface Props {
  vesselType?: string | null;
  imo?:        string | null;
  width?:      number | string;
  height?:     number | string;
  className?:  string;
}

function normalise(t?: string | null): string {
  const s = (t ?? "").toLowerCase();
  if (s.includes("tanker") || s.includes("vlcc") || s.includes("suezmax") || s.includes("aframax")) return "tanker";
  if (s.includes("bulk"))                         return "bulk";
  if (s.includes("container") || s.includes("box ship")) return "container";
  if (s.includes("lng") || s.includes("lpg") || s.includes("gas")) return "gas";
  if (s.includes("passenger") || s.includes("cruise") || s.includes("ferry")) return "passenger";
  if (s.includes("ro-ro") || s.includes("roro") || s.includes("car carrier")) return "roro";
  if (s.includes("general cargo") || s.includes("cargo")) return "cargo";
  return "default";
}

// ─── Tanker silhouette ────────────────────────────────────────────────────────
// Long low hull, single aft deckhouse, exposed deck with piping manifold
function TankerSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L40 105 L360 105 L385 120 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Aft deckhouse */}
      <rect x="300" y="80" width="60" height="25" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      <rect x="310" y="68" width="40" height="14" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Stack */}
      <line x1="335" y1="68" x2="335" y2="55" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
      {/* Deck piping manifold */}
      <line x1="60"  y1="105" x2="295" y2="105" stroke={GOLD} strokeWidth="1" strokeDasharray="4 8" opacity="0.6" />
      <rect x="100" y="99" width="8" height="6" fill={GOLD} opacity="0.5" />
      <rect x="160" y="99" width="8" height="6" fill={GOLD} opacity="0.5" />
      <rect x="220" y="99" width="8" height="6" fill={GOLD} opacity="0.5" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Bulk carrier silhouette ──────────────────────────────────────────────────
// Open hatch coamings along deck, bow and stern cranes
function BulkSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L50 108 L355 108 L385 128 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* 5 hatch coamings */}
      {[60, 110, 160, 210, 260].map(x => (
        <rect key={x} x={x} y="96" width="38" height="12" rx="1"
          fill="none" stroke={GREEN} strokeWidth="1.5" />
      ))}
      {/* Aft structure */}
      <rect x="308" y="82" width="45" height="26" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Bow crane */}
      <line x1="70"  y1="108" x2="70"  y2="75" stroke={GREEN} strokeWidth="2" strokeLinecap="round" />
      <line x1="70"  y1="75"  x2="50"  y2="88" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      {/* Stern crane */}
      <line x1="305" y1="108" x2="305" y2="75" stroke={GREEN} strokeWidth="2" strokeLinecap="round" />
      <line x1="305" y1="75"  x2="285" y2="88" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Container ship silhouette ────────────────────────────────────────────────
// Hull with stacked container blocks, post-Panamax style
function ContainerSVG() {
  const containerRows = [
    { y: 72,  x1: 70,  x2: 340 },
    { y: 86,  x1: 70,  x2: 340 },
    { y: 100, x1: 70,  x2: 340 },
  ];
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L55 112 L355 112 L385 130 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Container stacks */}
      {containerRows.map((row, ri) =>
        Array.from({ length: 9 }, (_, i) => {
          const x = row.x1 + i * 30;
          if (x + 26 > row.x2) return null;
          return (
            <rect key={`${ri}-${i}`} x={x} y={row.y} width="26" height="12"
              fill="none" stroke={GREEN} strokeWidth="1" opacity={0.7 + ri * 0.1} />
          );
        })
      )}
      {/* Bridge/superstructure amidships */}
      <rect x="180" y="54" width="50" height="18" rx="2"
        fill={NAVY} stroke={GREEN} strokeWidth="1.5" />
      {/* Radar mast */}
      <line x1="205" y1="54" x2="205" y2="40" stroke={GREEN} strokeWidth="2" strokeLinecap="round" />
      <line x1="198" y1="44" x2="212" y2="44" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Gas carrier (LNG/LPG) silhouette ────────────────────────────────────────
// Hull with three spherical dome tanks
function GasSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L45 112 L355 112 L385 128 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Three spherical tanks */}
      {[100, 180, 260].map(cx => (
        <circle key={cx} cx={cx} cy="98" r="26"
          fill="none" stroke={GREEN} strokeWidth="1.8" />
      ))}
      {/* Aft deckhouse */}
      <rect x="310" y="86" width="38" height="26" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      <line x1="329" y1="86" x2="329" y2="70" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Passenger / cruise silhouette ────────────────────────────────────────────
// Tall multi-deck superstructure, relatively small hull
function PassengerSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L50 122 L355 122 L385 134 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Superstructure — multiple decks */}
      <rect x="60"  y="102" width="280" height="20" rx="1" fill="none" stroke={GREEN} strokeWidth="1.5" />
      <rect x="80"  y="82"  width="250" height="20" rx="1" fill="none" stroke={GREEN} strokeWidth="1.5" />
      <rect x="100" y="62"  width="210" height="20" rx="1" fill="none" stroke={GREEN} strokeWidth="1.5" />
      <rect x="130" y="46"  width="150" height="16" rx="1" fill="none" stroke={GREEN} strokeWidth="1.5" />
      <rect x="155" y="34"  width="100" height="12" rx="1" fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Funnels */}
      <rect x="175" y="22" width="20" height="14" rx="2" fill="none" stroke={GREEN} strokeWidth="2" />
      <rect x="210" y="22" width="20" height="14" rx="2" fill="none" stroke={GREEN} strokeWidth="2" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── RoRo / car carrier silhouette ───────────────────────────────────────────
// Boxy flat-sided hull, stern ramp
function RoRoSVG() {
  return (
    <>
      {/* Hull — very boxy */}
      <path d="M30 145 L45 100 L355 100 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Deck levels (horizontal lines) */}
      <line x1="46" y1="116" x2="354" y2="116" stroke={GREEN} strokeWidth="1" opacity="0.6" />
      <line x1="46" y1="132" x2="354" y2="132" stroke={GREEN} strokeWidth="1" opacity="0.6" />
      {/* Bridge structure */}
      <rect x="300" y="72" width="50" height="28" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Stern ramp hint */}
      <line x1="355" y1="100" x2="385" y2="125" stroke={GOLD} strokeWidth="2.5"
        strokeLinecap="round" opacity="0.8" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── General cargo silhouette ─────────────────────────────────────────────────
// Hull with derrick crane amidships
function CargoSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L48 106 L355 106 L385 124 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Forward hatch */}
      <rect x="80" y="96" width="70" height="10" rx="1"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Aft hatch */}
      <rect x="220" y="96" width="80" height="10" rx="1"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Derrick/mast amidships */}
      <line x1="190" y1="106" x2="190" y2="55" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="190" y1="60"  x2="155" y2="90" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="190" y1="60"  x2="225" y2="90" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      {/* Aft house */}
      <rect x="308" y="80" width="45" height="26" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      <line x1="330" y1="80" x2="330" y2="62" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Default silhouette ───────────────────────────────────────────────────────
function DefaultSVG() {
  return (
    <>
      {/* Hull */}
      <path d="M20 145 L45 108 L355 108 L385 126 L385 145 Z"
        fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      {/* Midship house */}
      <rect x="160" y="84" width="80" height="24" rx="2"
        fill="none" stroke={GREEN} strokeWidth="1.5" />
      {/* Mast */}
      <line x1="200" y1="84" x2="200" y2="62" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="188" y1="68" x2="212" y2="68" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" />
      {/* Waterline */}
      <line x1="15" y1="145" x2="390" y2="145" stroke={GREEN} strokeWidth="1" opacity="0.3" />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function VesselTypeSVG({ vesselType, imo, width = "100%", height = "100%", className }: Props) {
  const type      = normalise(vesselType);
  const typeLabel = vesselType ?? "Vessel";

  const shapes: Record<string, React.ReactElement> = {
    tanker:    <TankerSVG />,
    bulk:      <BulkSVG />,
    container: <ContainerSVG />,
    gas:       <GasSVG />,
    passenger: <PassengerSVG />,
    roro:      <RoRoSVG />,
    cargo:     <CargoSVG />,
    default:   <DefaultSVG />,
  };

  return (
    <svg
      viewBox="0 0 400 180"
      width={width}
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: NAVY, display: "block" }}
      aria-label={`${typeLabel} silhouette`}
    >
      {/* Background gold accent line */}
      <line x1="0" y1="170" x2="400" y2="170" stroke={GOLD} strokeWidth="1.5" opacity="0.4" />

      {shapes[type] ?? shapes.default}

      {/* Type label */}
      <text x="200" y="168" textAnchor="middle"
        fill={GOLD} fontSize="9" fontFamily="Inter, sans-serif"
        letterSpacing="2" opacity="0.7">
        {typeLabel.toUpperCase()}
      </text>

      {/* IMO label */}
      {imo && (
        <text x="200" y="30" textAnchor="middle"
          fill={GREEN} fontSize="10" fontFamily="monospace" opacity="0.5">
          IMO {imo}
        </text>
      )}
    </svg>
  );
}
