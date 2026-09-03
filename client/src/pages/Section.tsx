import { Check, CheckCircle2, Clock3, FileText, LockKeyhole, ArrowLeft, Share2, Users2, X } from "lucide-react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const labels: Record<string, string> = { my_assets: "My assets", shared_with_me: "Shared with me", teams: "Teams", knowledge_hub: "Knowledge hub", requests: "Requests", approvals: "Approvals", analytics: "Analytics", audit: "Audit", settings: "Settings" };
const roleLabel = (role?: string) => role === "top_manager" ? "Top Manager" : role === "manager" ? "Manager" : "Team Member";
const roleSections: Record<string, readonly string[]> = {
  top_manager: ["my_assets", "shared_with_me", "teams", "knowledge_hub", "requests", "approvals", "analytics", "audit", "settings"],
  manager: ["my_assets", "shared_with_me", "teams", "knowledge_hub", "requests", "approvals", "analytics"],
  team_member: ["my_assets", "shared_with_me", "knowledge_hub", "requests"],
};

type AssetCardData = { id: string; assetKey: string; name: string; type: string; status: string; businessValue: string | null; estimatedHoursSaved: number; estimatedCostSaved: number };

function AssetCards({ items, emptyMessage }: { items: AssetCardData[]; emptyMessage: string }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  return <div className="grid gap-3 md:grid-cols-2">{items.map(asset => <Link key={asset.id} href={`/asset/${asset.id}`} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{asset.name}</div><div className="mt-1 text-xs text-slate-500">{asset.assetKey} · {asset.type}</div></div><Badge className="border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">{asset.status.replace(/_/g, " ")}</Badge></div><p className="mt-4 line-clamp-3 text-xs leading-5 text-slate-400">{asset.businessValue || "No business value has been documented yet."}</p><div className="mt-4 flex gap-4 text-[11px] text-slate-500"><span>{asset.estimatedHoursSaved || 0}h saved</span><span>{asset.estimatedCostSaved || 0} cost saved</span></div></Link>)}</div>;
}

export default function Section() {
  const { section = "workspace" } = useParams<{ section: string }>();
  const { user, loading } = useAuth();
  const assetsQuery = trpc.assets.list.useQuery({ limit: 50 }, { enabled: Boolean(user), retry: false });
  const myAssetsQuery = trpc.assets.myAssets.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const sharedQuery = trpc.assets.sharedWithMe.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const knowledgeQuery = trpc.assets.knowledgeHub.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const requestsQuery = trpc.assets.requests.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const queueQuery = trpc.governance.managerQueue.useQuery(undefined, { enabled: Boolean(user) && (user?.role === "manager" || user?.role === "top_manager"), retry: false });
  const decide = trpc.assets.decide.useMutation({ onSuccess: () => { void queueQuery.refetch(); void requestsQuery.refetch(); } });

  if (loading) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-400">Loading access policy...</div>;
  if (!user) return <div className="login-screen"><div className="login-card text-center"><LockKeyhole className="mx-auto text-cyan-300" /><h1 className="mt-4 text-xl font-semibold text-white">Internal access required</h1><Link href="/" className="mt-5 inline-block text-sm text-cyan-300">Return to sign in</Link></div></div>;
  const allowedSections = roleSections[user.role] ?? [];
  if (!allowedSections.includes(section)) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-200"><Link href="/" className="text-cyan-300">Return to ENGHUB</Link><div className="mx-auto mt-16 max-w-xl rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-8"><h1 className="text-xl font-semibold text-white">Access restricted</h1><p className="mt-3 text-sm leading-6 text-slate-400">This workspace section is not available for the {roleLabel(user.role)} role.</p></div></div>;

  const title = labels[section] || "Workspace section";
  const relevantQuery = section === "my_assets" ? myAssetsQuery : section === "shared_with_me" ? sharedQuery : section === "knowledge_hub" ? knowledgeQuery : assetsQuery;
  const loadingData = relevantQuery.isLoading || (section === "requests" && requestsQuery.isLoading) || (section === "approvals" && queueQuery.isLoading);
  const errorData = relevantQuery.isError || (section === "requests" && requestsQuery.isError) || (section === "approvals" && queueQuery.isError);
  const assetItems = (relevantQuery.data ?? []) as AssetCardData[];

  const renderContent = () => {
    if (section === "my_assets") return <AssetCards items={assetItems} emptyMessage="You have not submitted any assets yet." />;
    if (section === "shared_with_me") return <><div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><Share2 size={14} className="text-cyan-300" /> Assets explicitly shared with your user or one of your teams.</div><AssetCards items={assetItems} emptyMessage="No published assets have been shared with you." /></>;
    if (section === "knowledge_hub") return <><div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><Users2 size={14} className="text-cyan-300" /> Published and active assets available for reuse in your governed teams.</div><AssetCards items={assetItems} emptyMessage="The knowledge hub is empty for your teams." /></>;
    if (section === "teams") return <AssetCards items={assetItems} emptyMessage="No assets in your governed team scope." />;
    if (section === "requests") {
      const requests = requestsQuery.data ?? [];
      return requests.length ? <div className="grid gap-3">{requests.map(item => <div key={item.approvalId} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="flex items-start justify-between gap-4"><div><Link href={`/asset/${item.assetId}`} className="text-sm font-semibold text-white hover:text-cyan-200">{item.name}</Link><div className="mt-1 text-xs text-slate-500">{item.assetKey} · {item.type}</div></div><Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-200">{item.approvalStatus.replace(/_/g, " ")}</Badge></div><div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2"><span>Asset status: {item.assetStatus.replace(/_/g, " ")}</span><span>Requested: {new Date(item.requestedAt).toLocaleString()}</span>{item.decisionNote && <span className="sm:col-span-2">Note: {item.decisionNote}</span>}</div></div>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">You have no submitted requests.</div>;
    }
    if (section === "approvals") {
      const approvals = queueQuery.data ?? [];
      return approvals.length ? <div className="grid gap-3">{approvals.map(item => <div key={item.approvalId} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"><div className="flex items-start gap-4"><div className="rounded-lg bg-amber-400/10 p-2 text-amber-200"><Clock3 size={17} /></div><div className="min-w-0 flex-1"><Link href={`/asset/${item.assetId}`} className="truncate text-sm font-semibold text-white hover:text-cyan-200">{item.name}</Link><div className="mt-1 text-xs text-slate-500">{item.assetKey} · {item.type} · submitted {new Date(item.requestedAt).toLocaleString()}</div></div><Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-200">Pending</Badge></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/asset/${item.assetId}`} className="inline-flex items-center rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100">Inspect asset</Link><Button disabled={decide.isPending} className="create-button" onClick={() => decide.mutate({ approvalId: item.approvalId, decision: "approved" })}><Check size={14} /> Approve</Button><Button disabled={decide.isPending} variant="outline" className="secondary-button" onClick={() => decide.mutate({ approvalId: item.approvalId, decision: "changes_requested", note: "Please update the submission details." })}>Request changes</Button><Button disabled={decide.isPending} variant="outline" className="border-rose-400/20 text-rose-200 hover:bg-rose-400/10" onClick={() => decide.mutate({ approvalId: item.approvalId, decision: "rejected" })}><X size={14} /> Reject</Button></div></div>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No approvals are assigned to you.</div>;
    }
    if (section === "audit") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">Audit events are append-only and available from each asset detail page.</div>;
    if (section === "settings") return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">Workspace settings are restricted to Top Managers.</div>;
    return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">Analytics will use governed asset activity after the reporting model is enabled.</div>;
  };

  return <div className="min-h-screen bg-[#080f19] text-slate-200"><header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300"><ArrowLeft size={15} /> ENGHUB workspace</Link><Badge className="border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">{roleLabel(user.role)}</Badge></div></header><main className="mx-auto max-w-6xl px-6 py-10"><div className="text-[10px] uppercase tracking-[.22em] text-cyan-300">{section === "approvals" || section === "requests" ? "Governance workspace" : "Engineering workspace"}</div><h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Each section is backed by its own governed data: ownership, explicit shares, published knowledge, submitted requests, or assigned approvals.</p><div className="mt-8">{loadingData ? <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-slate-500">Loading governed workspace data...</div> : errorData ? <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-8 text-center text-sm text-rose-200">Unable to load this section. Check the API logs and try again.</div> : renderContent()}</div></main></div>;
}

void CheckCircle2;
void FileText;
void LockKeyhole;
