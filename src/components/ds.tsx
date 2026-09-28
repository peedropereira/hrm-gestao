// Peças básicas do design system (sem estado; funcionam em Server e Client Components).
import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";
import { KIND_ICON, KIND_LABEL } from "@/lib/labels";
import { diffDays, formatShort } from "@/lib/dates";
import type { ActionDTO, PersonDTO, SectorDTO, Tone } from "@/lib/types";
import type { ActionKind } from "@/generated/prisma/enums";

const TONE: Record<Tone, string> = {
  red: "bg-red-bg text-red",
  amber: "bg-amber-bg text-amber",
  green: "bg-green-bg text-green",
  blue: "bg-blue-bg text-blue",
  neutral: "bg-surface-2 text-fg-2",
  accent: "bg-ac-soft text-ac-text",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-[6px] px-2 text-[14px] font-semibold md:h-6 md:text-[13px] [&_svg]:size-3.5",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DueBadge({ a, today }: { a: Pick<ActionDTO, "status" | "dueDate">; today: string }) {
  if (a.status === "DONE")
    return (
      <Badge tone="green">
        <Check />
        Concluída
      </Badge>
    );
  if (!a.dueDate) return <Badge>Sem prazo</Badge>;
  const n = diffDays(today, a.dueDate);
  if (n < 0) return <Badge tone="red">Atrasada {-n} {-n === 1 ? "dia" : "dias"}</Badge>;
  if (n === 0) return <Badge tone="amber">Hoje</Badge>;
  if (n === 1) return <Badge>Amanhã</Badge>;
  return <Badge>{formatShort(a.dueDate)}</Badge>;
}

export function SectorTile({ sector, size = 22, className }: { sector: Pick<SectorDTO, "color" | "icon">; size?: number; className?: string }) {
  return (
    <span
      className={cn("sector-tile inline-grid shrink-0 place-items-center", className)}
      style={{ "--sc": sector.color, width: size, height: size, borderRadius: Math.round(size * 0.28) } as CSSProperties}
    >
      <Icon name={sector.icon} className="size-[58%]" />
    </span>
  );
}

export function SectorChip({ sector, className }: { sector: SectorDTO | undefined | null; className?: string }) {
  if (!sector) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-fg-2 md:text-[13px]", className)}>
      <SectorTile sector={sector} />
      {sector.shortName || sector.name}
    </span>
  );
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PersonChip({ person, className }: { person: PersonDTO | undefined | null; className?: string }) {
  const label = person ? person.name.split(" ")[0] : "Você";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] text-fg-2 md:text-[13px]", className)}>
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[10px] font-bold text-fg-2">
        {person ? initials(person.name) : "EU"}
      </span>
      {label}
    </span>
  );
}

export function KindLabel({ kind, className }: { kind: ActionKind; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[14px] text-fg-3 md:text-[13px] [&_svg]:size-3.5", className)}>
      <Icon name={KIND_ICON[kind]} />
      {KIND_LABEL[kind]}
    </span>
  );
}

export type Health = "red" | "amber" | "green";
const HEALTH_LABEL: Record<Health, string> = { red: "Crítico", amber: "Atenção", green: "Em dia" };
const DOT: Record<Health, string> = { red: "bg-red-solid", amber: "bg-amber-solid", green: "bg-green-solid" };
const HTEXT: Record<Health, string> = { red: "text-red", amber: "text-amber", green: "text-green" };

export function Dot({ status, className }: { status: Health; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[status], className)} aria-hidden="true" />;
}

export function HealthLabel({ status, children, className }: { status: Health; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold", HTEXT[status], className)}>
      <Dot status={status} />
      {children ?? HEALTH_LABEL[status]}
    </span>
  );
}

/** Mini gráfico de tendência em SVG puro (leve para o 4G). */
export function Spark({
  values,
  color,
  width = 90,
  height = 26,
  className,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const p = 3;
  const sx = (width - 2 * p) / (values.length - 1);
  const y = (v: number) => height - p - ((v - mn) / (mx - mn || 1)) * (height - 2 * p);
  const pts = values.map((v, i) => [p + i * sx, y(v)] as const);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const e = pts[pts.length - 1];
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={`${line} L${e[0].toFixed(1)} ${height} L${p} ${height} Z`} style={{ fill: color, fillOpacity: 0.13 }} />
      <path d={line} style={{ fill: "none", stroke: color, strokeWidth: 1.75, strokeLinejoin: "round", strokeLinecap: "round" }} />
      <circle cx={e[0]} cy={e[1]} r={2.8} style={{ fill: color }} />
    </svg>
  );
}

export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[14px] border-[1.5px] border-dashed border-line-strong px-5 py-7 text-center text-fg-2", className)}>
      <b className="mb-1 block text-[18px] text-fg">{title}</b>
      {children}
    </div>
  );
}

export function SectionHead({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-1 mb-2 flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 className="text-[20px] font-bold tracking-[-0.015em] md:text-[15px] md:font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-[14px] border border-line bg-surface shadow-card md:rounded-[12px]", className)}>{children}</div>;
}

export function PanelHead({ title, count, children }: { title: ReactNode; count?: number; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold md:text-[14px]">
        {title}
        {count !== undefined && <span className="font-mono text-[13px] font-medium text-fg-3">{count}</span>}
      </h3>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block h-4", className)} />;
}
