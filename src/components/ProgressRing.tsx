interface Props {
  percent: number;
  color?: string;
  size?: number;
  dark?: boolean;
}

export default function ProgressRing({ percent, color = 'var(--primary)', size = 44, dark = false }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const trackColor = dark ? '#374151' : '#eceef2';
  const textColor = dark ? '#e2e8f0' : '#475569';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: textColor }}>{clamped}</span>
      </div>
    </div>
  );
}
