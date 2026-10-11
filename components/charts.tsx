import { moneyShort, monthName, pct } from "@/lib/format";
import type { MonthPoint } from "@/lib/stats";

/**
 * The window: a sash whose glass fills to the year's margin after commission.
 * The meeting rail sits exactly on the target, so "above the rail" means on target.
 */
export function MarginWindow({ value, target, scaleMax = 0.8 }: { value: number | null; target: number; scaleMax?: number }) {
  const W = 300, H = 380, frame = 12;
  const gx = frame, gy = frame, gw = W - frame * 2, gh = H - frame * 2;
  const y = (p: number) => gy + gh - (Math.min(Math.max(p, 0), scaleMax) / scaleMax) * gh;
  const fillY = value === null ? gy + gh : y(value);
  const railY = y(target);
  const meets = value !== null && value >= target;
  const fill = meets ? "var(--teal)" : "var(--amber)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="window-svg" role="img" aria-label={value === null ? "No margin yet" : `Margin after commission ${pct(value)} against a ${pct(target, 0)} target`}>
      <defs>
        <clipPath id="glass-clip">
          <rect x={gx} y={gy} width={gw} height={gh} rx="3" />
        </clipPath>
      </defs>
      <rect x={gx} y={gy} width={gw} height={gh} rx="3" fill="var(--glass-fill)" />
      <g clipPath="url(#glass-clip)">
        <rect className="glass-level" x={gx} y={fillY} width={gw} height={gy + gh - fillY} fill={fill} opacity="0.2" />
        <line className="glass-edge" x1={gx} x2={gx + gw} y1={fillY} y2={fillY} stroke={fill} strokeWidth="2.5" />
        <path d={`M ${gx + 34} ${gy + gh} L ${gx + 150} ${gy} L ${gx + 176} ${gy} L ${gx + 60} ${gy + gh} Z`} fill="#fff" opacity="0.35" />
        <path d={`M ${gx + 86} ${gy + gh} L ${gx + 202} ${gy} L ${gx + 214} ${gy} L ${gx + 98} ${gy + gh} Z`} fill="#fff" opacity="0.3" />
      </g>
      {/* outer frame */}
      <rect x={frame / 2} y={frame / 2} width={W - frame} height={H - frame} rx="8" fill="none" stroke="var(--ink)" strokeWidth={frame} />
      {/* meeting rail on the target line */}
      <rect x={gx} y={railY - 5} width={gw} height="10" fill="var(--ink)" />
      <text x={gx + gw - 10} y={railY - 12} textAnchor="end" className="window-label">
        Target {pct(target, 0)}
      </text>
    </svg>
  );
}

export function MonthlyChart({ points, target, year }: { points: MonthPoint[]; target: number; year: number }) {
  const W = 760, H = 270, left = 46, right = 8, top = 14, bottom = 52;
  const innerW = W - left - right, innerH = H - top - bottom;
  const maxVal = Math.max(...points.map((p) => Math.max(p.booked, p.completed)), 1);
  const step = niceStep(maxVal / 4);
  const ymax = Math.ceil(maxVal / step) * step;
  const ticks = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const colW = innerW / 12;
  const y = (v: number) => top + innerH - (v / ymax) * innerH;
  const nowMonth = new Date().getFullYear() === year ? new Date().getMonth() : new Date().getFullYear() < year ? -1 : 11;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`Sales booked and jobs completed by month, ${year}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="var(--mullion-soft)" strokeWidth="1" />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" className="axis">
            {t === 0 ? "$0" : moneyShort(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = left + colW * i + colW / 2;
        const bw = Math.min(colW * 0.74, 40);
        const iw = bw * 0.58;
        const low = p.marginPct !== null && p.marginPct < target;
        const future = i > nowMonth;
        return (
          <g key={p.month} opacity={future && p.booked + p.completed === 0 ? 0.5 : 1}>
            <title>{`${monthName(i)} ${year}: ${p.bookedCount} sold for ${moneyShort(p.booked)}; ${p.completedCount} completed for ${moneyShort(p.completed)}${p.marginPct !== null ? `, ${pct(p.marginPct)} margin after commission` : ""}`}</title>
            {p.booked > 0 && (
              <rect x={cx - bw / 2} y={y(p.booked)} width={bw} height={y(0) - y(p.booked)} rx="3" fill="none" stroke="var(--ink-3)" strokeWidth="1.4" strokeDasharray="3 3" />
            )}
            {p.completed > 0 && (
              <rect x={cx - iw / 2} y={y(p.completed)} width={iw} height={y(0) - y(p.completed)} rx="2.5" fill={low ? "var(--amber)" : "var(--teal)"} />
            )}
            <text x={cx} y={H - 30} textAnchor="middle" className="axis axis-month">{monthName(i)}</text>
            <text x={cx} y={H - 12} textAnchor="middle" className={`axis axis-pct${low ? " low" : ""}`}>
              {p.marginPct === null ? "" : `${(p.marginPct * 100).toFixed(0)}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function StackBar({ parts }: { parts: { key: string; label: string; color: string; value: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="stackbar" role="img" aria-label="Open jobs by stage">
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}

export function HBars({ items, target }: { items: { key: string; value: number; label: string; right: string; ok: boolean | null }[]; target?: number }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  void target;
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.key}>
          <div className="hbars-top">
            <span>{i.label}</span>
            <span className={`hbars-right${i.ok === false ? " low" : ""}`}>{i.right}</span>
          </div>
          <div className="hbars-track">
            <span style={{ width: `${(i.value / max) * 100}%`, background: i.ok === false ? "var(--amber)" : "var(--teal)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
