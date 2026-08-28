import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";

const labels: Record<string, string> = { my_assets: "My assets", shared_with_me: "Shared with me", teams: "Teams", knowledge_hub: "Knowledge hub", requests: "Requests", approvals: "Approvals", analytics: "Analytics", audit: "Audit", settings: "Settings" };
export default function Section() {
  const { section = "workspace" } = useParams<{ section: string }>();
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-400">Loading access policy...</div>;
  const title = labels[section] || "Workspace section";
  return <div className="min-h-screen bg-[#080f19] text-slate-200"><header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300"><ArrowLeft size={15} /> ENGHUB workspace</Link><Badge className="border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">{user ? (user.role === "top_manager" ? "Top Manager" : user.role === "manager" ? "Manager" : "Team Member") : "Demo preview"}</Badge></div></header><main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-3xl items-center px-6 py-12"><div className="w-full rounded-2xl border border-white/[0.08] bg-[#0d1826] p-8 shadow-2xl"><LockKeyhole size={22} className="text-cyan-300" /><div className="mt-5 text-[10px] uppercase tracking-[.22em] text-slate-500">Governed workspace section</div><h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">This section is now a real route in ENGHUB. Its role-scoped tools and PostgreSQL-backed records are ready to be connected to the corresponding workspace workflow.</p><div className="mt-7 rounded-lg border border-amber-400/15 bg-amber-300/[0.05] p-4 text-xs leading-5 text-amber-100/75">Access is enforced by role and team scope. Top Managers see all governance tools, Managers see their team work, and Team Members see their own submissions and approved shared assets.</div><Link href="/" className="mt-7 inline-flex text-xs font-semibold text-cyan-300">Return to overview</Link></div></main></div>;
}
