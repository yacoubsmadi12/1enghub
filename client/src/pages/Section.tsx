import { ArrowLeft, CheckCircle2, LockKeyhole, Users2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const labels: Record<string, string> = { my_assets: "My assets", shared_with_me: "Shared with me", teams: "Teams", knowledge_hub: "Knowledge hub", requests: "Requests", approvals: "Approvals", analytics: "Analytics", audit: "Audit", settings: "Settings" };
const roleLabel = (role?: string) => role === "top_manager" ? "Top Manager" : role === "manager" ? "Manager" : "Team Member";

export default function Section() {
  const { section = "workspace" } = useParams<{ section: string }>();
  const { user, loading } = useAuth();
  const assetsQuery = trpc.assets.list.useQuery({ limit: 50 }, { enabled: Boolean(user), retry: false });
  const usersQuery = trpc.administration.listUsers.useQuery(undefined, { enabled: user?.role === "top_manager", retry: false });
  if (loading) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-400">Loading access policy...</div>;
  if (!user) return <div className="login-screen"><div className="login-card text-center"><LockKeyhole className="mx-auto text-cyan-300" /><h1 className="mt-4 text-xl font-semibold text-white">Internal access required</h1><Link href="/" className="mt-5 inline-block text-sm text-cyan-300">Return to sign in</Link></div></div>;
  const allAssets = assetsQuery.data ?? [];
  const pendingAssets = allAssets.filter(asset => asset.status === "pending_review");
  const isManagement = ["approvals", "requests", "teams", "analytics", "audit", "settings"].includes(section);
  const title = labels[section] || "Workspace section";
  const renderManagement = () => {
    if (section === "approvals" || section === "requests") return <div className="grid gap-3">{pendingAssets.length ? pendingAssets.map(asset => <div key={asset.id} className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"><div className="rounded-lg bg-amber-400/10 p-2 text-amber-200"><CheckCircle2 size={17} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{asset.name}</div><div className="mt-1 text-xs text-slate-500">{asset.assetKey} · {asset.type} · awaiting Manager review</div></div><Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-200">Pending</Badge></div>) : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No PostgreSQL review requests are waiting in your scope.</div>}</div>;
    if (section === "teams") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="flex items-center gap-3"><Users2 className="text-cyan-300" size={18} /><div><div className="text-sm font-semibold text-white">Team workspace</div><div className="mt-1 text-xs text-slate-500">Your visible assets are filtered by PostgreSQL team membership.</div></div></div><div className="mt-5 text-3xl font-semibold text-white">{allAssets.length}</div><div className="mt-1 text-xs text-slate-500">assets in your governed scope</div></div>;
    if (section === "audit") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">Audit events are append-only and available from each asset detail page. Top Managers can review the full audit trail.</div>;
    if (section === "settings") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">Workspace settings are restricted to Top Managers. Use User management to govern roles, activation, and team assignments.</div>;
    if (section === "analytics") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="text-xs uppercase tracking-[.18em] text-slate-500">Live asset scope</div><div className="mt-3 text-3xl font-semibold text-white">{allAssets.length}</div><div className="mt-1 text-xs text-slate-500">assets returned from PostgreSQL</div>{usersQuery.data && <div className="mt-5 text-xs text-slate-400">{usersQuery.data.length} governed users</div>}</div>;
    return null;
  };
  return <div className="min-h-screen bg-[#080f19] text-slate-200"><header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300"><ArrowLeft size={15} /> ENGHUB workspace</Link><Badge className="border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">{roleLabel(user.role)}</Badge></div></header><main className="mx-auto max-w-6xl px-6 py-10"><div className="text-[10px] uppercase tracking-[.22em] text-cyan-300">{isManagement ? "Governance workspace" : "Engineering workspace"}</div><h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{isManagement ? "This workspace is connected to your internal role and PostgreSQL team scope." : "Your role determines which assets and actions are visible here."}</p><div className="mt-8">{isManagement ? renderManagement() : <div className="grid gap-3">{allAssets.length ? allAssets.slice(0, 12).map(asset => <Link key={asset.id} href={`/asset/${asset.id}`} className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 hover:border-cyan-300/30"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{asset.name}</div><div className="mt-1 text-xs text-slate-500">{asset.assetKey} · {asset.type} · {asset.status}</div></div><ArrowLeft className="rotate-180 text-slate-600" size={16} /></Link>) : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No PostgreSQL assets are available in your scope yet.</div>}</div>}</div></main></div>;
}
