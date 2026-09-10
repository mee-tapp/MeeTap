export function CityMap({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 220"
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      <g fill="var(--secondary)" opacity="0.7">
        <rect x="36" y="16" width="46" height="30" rx="3" />
        <rect x="98" y="58" width="38" height="26" rx="3" />
        <rect x="206" y="22" width="52" height="34" rx="3" />
        <rect x="298" y="68" width="40" height="28" rx="3" />
        <rect x="378" y="28" width="48" height="32" rx="3" />
        <rect x="468" y="88" width="40" height="26" rx="3" />
        <rect x="58" y="138" width="50" height="32" rx="3" />
        <rect x="176" y="148" width="44" height="30" rx="3" />
        <rect x="316" y="138" width="52" height="34" rx="3" />
        <rect x="446" y="148" width="42" height="28" rx="3" />
        <rect x="518" y="38" width="40" height="28" rx="3" />
      </g>

      <g stroke="var(--border)" strokeWidth="1" opacity="0.8">
        <line x1="0" y1="30" x2="600" y2="30" />
        <line x1="0" y1="70" x2="600" y2="65" />
        <line x1="0" y1="110" x2="600" y2="105" />
        <line x1="0" y1="150" x2="600" y2="145" />
        <line x1="0" y1="190" x2="600" y2="185" />
        <line x1="90" y1="0" x2="90" y2="220" />
        <line x1="180" y1="0" x2="175" y2="220" />
        <line x1="270" y1="0" x2="270" y2="220" />
        <line x1="360" y1="0" x2="365" y2="220" />
        <line x1="450" y1="0" x2="450" y2="220" />
        <line x1="540" y1="0" x2="535" y2="220" />
      </g>

      <g stroke="var(--border)" strokeWidth="2.5" opacity="1">
        <line x1="0" y1="45" x2="600" y2="95" />
        <line x1="0" y1="175" x2="600" y2="115" />
        <line x1="145" y1="0" x2="120" y2="220" />
        <line x1="430" y1="0" x2="465" y2="220" />
      </g>
    </svg>
  );
}
