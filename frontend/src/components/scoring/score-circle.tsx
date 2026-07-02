'use client';

/**
 * Score Circle — SVG circular progress ring.
 *
 * Color thresholds: 0-30 red, 30-60 yellow, 60-100 green.
 */

type ScoreCircleProps = {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
};

export function ScoreCircle({
  score,
  size = 160,
  strokeWidth = 10,
  label,
}: ScoreCircleProps): React.ReactElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score < 30 ? 'stroke-red-500' :
    score < 60 ? 'stroke-amber-500' :
    'stroke-green-500';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-100"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-3xl font-bold tabular-nums">{Math.round(score)}</span>
        {label && <span className="text-xs text-zinc-400">{label}</span>}
      </div>
    </div>
  );
}
