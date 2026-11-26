import {
  Activity, BadgeCheck, Scale, Hammer, Handshake, Sparkle, BarChart3, Bot, Compass, KeySquare, BookOpen, Building2, CalendarDays, ClipboardCheck, Crown, FileText, FolderKanban, HeartHandshake,
  Inbox, LayoutDashboard, Landmark, ListChecks, Lock, MessageCircle, Package, Plug, Receipt,
  Rocket, ShieldCheck, Sparkles, Target, Crosshair, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { SectionId } from "@/lib/rbac";

export const NAV_ICONS: Record<SectionId, LucideIcon> = {
  console: Crown, security: ShieldCheck, integrations: Plug, content: FileText, approvals: ClipboardCheck, reports: BarChart3, networth: Scale, personal: Lock,
  dashboard: LayoutDashboard, assistant: Bot, intelligence: Sparkles, inbox: Inbox, calendar: CalendarDays, whatsapp: MessageCircle, portfolio: Building2,
  ventures: Rocket, deals: Target, money: Wallet, books: BookOpen, invoices: Receipt, bank: Landmark, assets: Package,
  budgets: Crosshair, tasks: ListChecks, people: Users, vault: FolderKanban, marrow: HeartHandshake, access: ShieldCheck, kyc: BadgeCheck, secrets: KeySquare, guides: Compass, activity: Activity, v_build: Hammer, v_co_build: Handshake, v_own: Landmark, v_studio: Sparkle,
};

/**
 * One soft colour per sidebar group. Every icon in a group shares it, so colour says where you are
 * in the portal, never which page: a rainbow of thirty colours would hide the page you are on.
 */
export const GROUP_HUE: Record<string, string> = {
  pinned: "#64748b",
  super: "#b45309",
  intelligence: "#0284c7",
  ventures: "#7c3aed",
  infrastructure: "#0f766e",
  personal: "#be185d",
};
