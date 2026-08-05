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
  theme?:      "dark" | "light";
  size?:       "cover" | "card";
}

function normalise(t?: string | null): string {
  const s = (t ?? "").toLowerCase();
  if (s.includes("tanker") || s.includes("vlcc") || s.includes("suezmax") || s.includes("aframax")) return "tanker";
  if (s.includes("bulk"))                                                                             return "bulk";
  if (s.includes("container") || s.includes("box ship"))                                             return "container";
  if (s.includes("lng") || s.includes("lpg") || s.includes("gas"))                                  return "gas";
  if (s.includes("passenger") || s.includes("cruise") || s.includes("ferry"))                       return "passenger";
  if (s.includes("ro-ro") || s.includes("roro") || s.includes("car carrier"))                       return "roro";
  if (s.includes("general cargo") || s.includes("cargo"))                                            return "cargo";
  return "default";
}

// Tanker: long low hull, multiple deck hatches, funnel aft
function TankerSVG({ fill, struct, stroke, accent }: { fill: string; struct: string; stroke: string; accent: string }) {
  return (
    <>
      {/* hull */}
      <path d="M20 145 L40 105 L360 105 L385 120 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {/* superstructure/bridge aft */}
      <rect x="300" y="80" width="60" height="25" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="310" y="68" width="40" height="14" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      {/* funnel */}
      <line x1="335" y1="68" x2="335" y2="55" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      {/* pipe runs */}
      <line x1="60" y1="105" x2="295" y2="105" stroke={accent} strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />
      <rect x="100" y="99" width="8" height="6" fill={accent} opacity="0.4" />
      <rect x="160" y="99" width="8" height="6" fill={accent} opacity="0.4" />
      <rect x="220" y="99" width="8" height="6" fill={accent} opacity="0.4" />
    </>
  );
}

// Bulk carrier: hull with hatches + cranes fore and aft
function BulkSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  return (
    <>
      <path d="M20 145 L50 108 L355 108 L385 128 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {[60, 110, 160, 210, 260].map(x => (
        <rect key={x} x={x} y="96" width="38" height="12" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      ))}
      <rect x="308" y="82" width="45" height="26" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      {/* cranes */}
      <line x1="70" y1="108" x2="70" y2="75" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="70" y1="75" x2="50" y2="88" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="305" y1="108" x2="305" y2="75" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="305" y1="75" x2="285" y2="88" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

// Container: stacked container rows amidships
function ContainerSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  const rows = [{ y: 72 }, { y: 86 }, { y: 100 }];
  return (
    <>
      <path d="M20 145 L55 112 L355 112 L385 130 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {rows.map((row, ri) =>
        Array.from({ length: 9 }, (_, i) => {
          const x = 70 + i * 30;
          if (x + 26 > 340) return null;
          return <rect key={`${ri}-${i}`} x={x} y={row.y} width="26" height="12" fill={struct} stroke={stroke} strokeWidth="0.8" opacity={0.5 + ri * 0.2} />;
        })
      )}
      <rect x="180" y="54" width="50" height="18" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="205" y1="54" x2="205" y2="40" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="198" y1="44" x2="212" y2="44" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

// LNG/Gas: rounded dome tanks
function GasSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  return (
    <>
      <path d="M20 145 L45 112 L355 112 L385 128 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {[100, 180, 260].map(cx => (
        <circle key={cx} cx={cx} cy="98" r="26" fill={struct} stroke={stroke} strokeWidth="1.5" />
      ))}
      <rect x="310" y="86" width="38" height="26" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="329" y1="86" x2="329" y2="70" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

// Passenger/cruise: multiple superstructure decks stacked
function PassengerSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  return (
    <>
      <path d="M20 145 L50 122 L355 122 L385 134 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="60"  y="102" width="280" height="20" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="80"  y="82"  width="250" height="20" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="100" y="62"  width="210" height="20" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="130" y="46"  width="150" height="16" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="155" y="34"  width="100" height="12" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      {/* funnels */}
      <rect x="175" y="22" width="20" height="14" rx="2" fill={struct} stroke={stroke} strokeWidth="1.5" />
      <rect x="210" y="22" width="20" height="14" rx="2" fill={struct} stroke={stroke} strokeWidth="1.5" />
    </>
  );
}

// RoRo: flat deck + stern ramp
function RoRoSVG({ fill, struct, stroke, accent }: { fill: string; struct: string; stroke: string; accent: string }) {
  return (
    <>
      <path d="M30 145 L45 100 L355 100 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="46" y1="116" x2="354" y2="116" stroke={stroke} strokeWidth="1" opacity="0.4" />
      <line x1="46" y1="132" x2="354" y2="132" stroke={stroke} strokeWidth="1" opacity="0.4" />
      <rect x="300" y="72" width="50" height="28" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="355" y1="100" x2="385" y2="125" stroke={accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </>
  );
}

// General cargo
function CargoSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  return (
    <>
      <path d="M20 145 L48 106 L355 106 L385 124 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="80"  y="96" width="70" height="10" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <rect x="220" y="96" width="80" height="10" rx="1" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="190" y1="106" x2="190" y2="55" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="190" y1="60"  x2="155" y2="90" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="190" y1="60"  x2="225" y2="90" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="308" y="80" width="45" height="26" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="330" y1="80" x2="330" y2="62" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

// Default / unknown
function DefaultSVG({ fill, struct, stroke }: { fill: string; struct: string; stroke: string }) {
  return (
    <>
      <path d="M20 145 L45 108 L355 108 L385 126 L385 145 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="160" y="84" width="80" height="24" rx="2" fill={struct} stroke={stroke} strokeWidth="1" />
      <line x1="200" y1="84" x2="200" y2="62" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="188" y1="68" x2="212" y2="68" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

export default function VesselTypeSVG({
  vesselType, imo, width = "100%", height = "100%", className, theme = "dark", size = "card",
}: Props) {
  const type      = normalise(vesselType);
  const typeLabel = vesselType ?? "Vessel";
  const isDark    = theme === "dark";
  const isCover   = size === "cover";

  // Colours
  const bg       = isDark ? NAVY      : "#F4EFE6";
  const stroke   = isDark ? GREEN     : NAVY;
  const accent   = GOLD;
  const textFill = isDark ? GOLD      : "#6B7280";
  const imoFill  = isDark ? GREEN     : "#9CA3AF";
  // Filled hull & superstructure — subtle layer over background
  const hullFill   = isDark ? "rgba(29,158,117,0.18)"  : "rgba(16,24,40,0.10)";
  const structFill = isDark ? "rgba(29,158,117,0.10)"  : "rgba(16,24,40,0.07)";

  const shapeProps = { fill: hullFill, struct: structFill, stroke, accent };

  const shapes: Record<string, React.ReactElement> = {
    tanker:    <TankerSVG    {...shapeProps} />,
    bulk:      <BulkSVG      {...shapeProps} />,
    container: <ContainerSVG {...shapeProps} />,
    gas:       <GasSVG       {...shapeProps} />,
    passenger: <PassengerSVG {...shapeProps} />,
    roro:      <RoRoSVG      {...shapeProps} />,
    cargo:     <CargoSVG     {...shapeProps} />,
    default:   <DefaultSVG   {...shapeProps} />,
  };

  return (
    <svg
      viewBox="0 0 400 180"
      width={width}
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: bg, display: "block" }}
      aria-label={`${typeLabel} silhouette`}
    >
      {/* Waterline */}
      <line x1="0" y1="170" x2="400" y2="170" stroke={accent}
        strokeWidth={isCover ? "2.5" : "1.5"}
        opacity={isCover ? "0.7" : "0.35"} />

      {/* Top rule (cover only) */}
      {isCover && (
        <line x1="0" y1="6" x2="400" y2="6" stroke={accent} strokeWidth="2.5" opacity="0.7" />
      )}

      {shapes[type] ?? shapes.default}

      {/* Type label */}
      <text x="200" y="168" textAnchor="middle"
        fill={textFill}
        fontSize={isCover ? "13" : "9"}
        fontFamily="Inter, sans-serif"
        letterSpacing="2"
        opacity="0.85"
        fontWeight={isCover ? "700" : "400"}>
        {typeLabel.toUpperCase()}
      </text>

      {/* IMO watermark */}
      {imo && (
        <text x="200" y="28" textAnchor="middle"
          fill={imoFill}
          fontSize={isCover ? "12" : "10"}
          fontFamily="monospace"
          opacity="0.55">
          IMO {imo}
        </text>
      )}
    </svg>
  );
}
