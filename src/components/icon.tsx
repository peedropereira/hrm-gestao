import {
  BadgeCheck,
  BellRing,
  Briefcase,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Cog,
  Construction,
  DraftingCompass,
  Factory,
  Flame,
  Forward,
  Gauge,
  Hammer,
  Handshake,
  HardHat,
  Landmark,
  Lock,
  Package,
  PaintRoller,
  PhoneCall,
  Play,
  Scale,
  ShoppingCart,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Ícones que podem ser escolhidos para setores (nome gravado no banco) e outros usados por nome.
export const SECTOR_ICONS: Record<string, LucideIcon> = {
  handshake: Handshake,
  "drafting-compass": DraftingCompass,
  "calendar-range": CalendarRange,
  factory: Factory,
  "paint-roller": PaintRoller,
  "badge-check": BadgeCheck,
  "shopping-cart": ShoppingCart,
  package: Package,
  truck: Truck,
  wrench: Wrench,
  "hard-hat": HardHat,
  users: Users,
  landmark: Landmark,
  briefcase: Briefcase,
  hammer: Hammer,
  flame: Flame,
  cog: Cog,
  construction: Construction,
  building: Building2,
  gauge: Gauge,
};

const OTHER: Record<string, LucideIcon> = {
  play: Play,
  forward: Forward,
  "bell-ring": BellRing,
  scale: Scale,
  "clipboard-check": ClipboardCheck,
  "phone-call": PhoneCall,
  lock: Lock,
};

export function Icon({ name, className, strokeWidth = 2 }: { name: string; className?: string; strokeWidth?: number }) {
  const C = SECTOR_ICONS[name] ?? OTHER[name] ?? Building2;
  return <C className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
