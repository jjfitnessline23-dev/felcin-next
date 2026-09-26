"use client";

// Flame chip showing the user's workout streak. Three states:
//  - active today: filled orange flame + "N day streak"
//  - at risk (has streak, not logged today): amber outline flame + "Nd · keep it alive"
//  - none: muted flame + "Start a streak"

export default function StreakChip({
  current,
  atRisk,
  activeToday,
}: {
  current: number;
  atRisk?: boolean;
  activeToday?: boolean;
}) {
  const has = current > 0;
  const color = !has ? "#666" : atRisk ? "#f59e0b" : "#ff7a1a";
  const bg = !has ? "rgba(255,255,255,0.05)" : atRisk ? "rgba(245,158,11,0.12)" : "rgba(255,122,26,0.14)";
  const border = !has ? "rgba(255,255,255,0.08)" : atRisk ? "rgba(245,158,11,0.32)" : "rgba(255,122,26,0.38)";
  const label = !has ? "Start a streak" : atRisk ? `${current}d · keep it alive` : `${current} day streak`;

  return (
    <div
      title={atRisk ? "Log a workout today to keep your streak alive" : has ? `${current}-day workout streak` : "Log a workout to start a streak"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 999,
        background: bg, border: `1px solid ${border}`, whiteSpace: "nowrap",
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 14, color, lineHeight: 1,
          fontVariationSettings: has && !atRisk ? "'FILL' 1" : "'FILL' 0",
          filter: has && activeToday ? `drop-shadow(0 0 6px ${color})` : "none",
        }}
      >
        local_fire_department
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color: has ? "#f2f2f2" : "#777", letterSpacing: 0.2 }}>{label}</span>
    </div>
  );
}
