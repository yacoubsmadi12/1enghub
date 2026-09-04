import BrandMark from "@/components/BrandMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Archive,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Command,
  FileCheck2,
  FileCode2,
  FileText,
  Filter,
  FolderKanban,
  Gauge,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  UserRound,
  Users2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
type AssetStatus = "Active" | "Pending review" | "Draft" | "Changes requested";
type Asset = {
  id: string;
  name: string;
  type: string;
  owner: string;
  team: string;
  version: string;
  status: AssetStatus;
  usage: string;
  technology: string;
  updated: string;
  accent: string;
  icon: typeof FileCode2;
};

const navItems = [
  { label: "Overview", icon: LayoutDashboard, path: "/" },
  { label: "Asset library", icon: FolderKanban, path: "/library" },
  { label: "My assets", icon: GitBranch, path: "/workspace/my_assets" },
  { label: "Shared with me", icon: Users2, path: "/workspace/shared_with_me" },
  { label: "User Management", icon: Users2, path: "/admin/users" },
  { label: "My team", icon: Users2, path: "/manager/team" },
  { label: "Knowledge hub", icon: Sparkles, path: "/workspace/knowledge_hub" },
];
const governanceItems = [
  { label: "Requests", icon: Clock3, count: "08", path: "/workspace/requests" },
  { label: "Approvals", icon: FileCheck2, count: "04", path: "/workspace/approvals" },
  { label: "Analytics", icon: Activity, path: "/workspace/analytics" },
  { label: "Audit", icon: LockKeyhole, path: "/workspace/audit" },
  { label: "Settings", icon: Settings2, path: "/workspace/settings" },
];
const filterTypes = ["All types", "Automation", "Tool", "Runbook", "SOP", "Report"];
const liveIconByType = { tool: Gauge, automation: Zap, runbook: FileText, sop: ShieldCheck, report: FileCheck2, knowledge_article: Sparkles } as const;
function toUiAsset(asset: { id: string; assetKey: string; name: string; type: string; status: string; technology: string | null; currentVersion: string; ownerId: string; homeTeamId: string; estimatedHoursSaved: number; updatedAt: Date; classification: string }): Asset {
  const type = asset.type.toLowerCase();
  const status = asset.status === "pending_review" ? "Pending review" : asset.status === "changes_requested" ? "Changes requested" : asset.status === "draft" ? "Draft" : "Active";
  return { id: asset.id, name: asset.name, type: type === "knowledge_article" ? "Report" : type[0].toUpperCase() + type.slice(1), owner: asset.ownerId, team: asset.homeTeamId, version: `v${asset.currentVersion}`, status, usage: `${asset.estimatedHoursSaved}h saved`, technology: asset.technology || "Engineering", updated: new Date(asset.updatedAt).toLocaleDateString(), accent: type === "runbook" ? "amber" : type === "sop" ? "rose" : type === "tool" ? "violet" : "cyan", icon: liveIconByType[type as keyof typeof liveIconByType] || FileText };
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.internalLogin.useMutation({ onSuccess: () => { void onAuthenticated(); } });
  return <div className="login-screen">
    <div className="telecom-scene" aria-hidden="true"><div className="telecom-horizon" /><div className="signal-arc arc-one" /><div className="signal-arc arc-two" /><div className="signal-arc arc-three" /><div className="signal-node node-one" /><div className="signal-node node-two" /><div className="signal-node node-three" /><div className="telecom-tower tower-one"><i /><i /><i /></div><div className="telecom-tower tower-two"><i /><i /><i /></div><div className="telecom-tower tower-three"><i /><i /><i /></div><div className="telecom-tower tower-four"><i /><i /><i /></div><div className="network-pulse pulse-one" /><div className="network-pulse pulse-two" /><div className="network-pulse pulse-three" /></div>
    <div className="login-vignette" aria-hidden="true" />
    <div className="login-layout">
      <section className="login-story hidden xl:block"><div className="eyebrow"><span className="live-dot" /> Network operations intelligence</div><h2>Keep every signal,<br /><span>decision, and asset</span><br />in motion.</h2><p>One governed memory for the teams building the networks that connect everything.</p><div className="story-metrics"><div><strong>24/7</strong><span>Operational visibility</span></div><div><strong>100%</strong><span>Traceable releases</span></div></div></section>
      <div className="login-card login-card-polished">
        <div className="login-card-header"><div className="login-brand-lockup"><BrandMark /><div><strong>ENGHUB</strong><span>Engineering memory</span></div></div><span className="login-secure-badge"><LockKeyhole size={12} /> Secure</span></div>
        <div className="login-divider" />
        <div className="eyebrow"><span className="live-dot" /> Internal workspace</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Welcome back<span className="text-cyan-300">.</span></h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Sign in to continue to your governed engineering workspace.</p>
        <form className="login-form" onSubmit={event => { event.preventDefault(); login.mutate({ username, password }); }}>
          <label className="login-field" htmlFor="enghub-username"><span>Username</span><div className="login-input-wrap"><UserRound size={15} /><input id="enghub-username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter your username" /></div></label>
          <label className="login-field" htmlFor="enghub-password"><span>Password</span><div className="login-input-wrap"><KeyRound size={15} /><input id="enghub-password" autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></div></label>
          <div className="login-form-meta"><span><LockKeyhole size={12} /> Internal account</span><Link href="/forgot-password" className="text-cyan-300 hover:text-cyan-100">Forgot password reset now</Link></div>
          <Button type="submit" disabled={login.isPending || username.trim().length < 3 || password.length < 8} className="create-button login-submit">{login.isPending ? "Signing in..." : "Sign in to workspace"} <ArrowUpRight size={15} /></Button>
        </form>
        {login.error && <p role="alert" className="login-error">{login.error.message}</p>}
        <div className="login-card-footer"><span>Role-based access</span><span>Auditable activity</span><span>PostgreSQL-backed</span></div>
      </div>
    </div>
  </div>;
}

function StatusPill({ status }: { status: AssetStatus }) {
  const style = {
    Active: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    "Pending review": "border-amber-400/20 bg-amber-400/10 text-amber-200",
    Draft: "border-slate-400/20 bg-slate-400/10 text-slate-300",
    "Changes requested": "border-rose-400/20 bg-rose-400/10 text-rose-300",
  }[status];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", style)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function MetricCard({ label, value, delta, icon: Icon, tone }: { label: string; value: string; delta: string; icon: typeof Gauge; tone: string }) {
  return <div className="metric-card group">
    <div className="flex items-start justify-between"><div className={cn("icon-box", tone)}><Icon size={18} /></div><ArrowUpRight className="text-slate-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan-300" size={16} /></div>
    <div className="mt-5 text-2xl font-semibold tracking-tight text-white">{value}</div>
    <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs text-slate-400">{label}</span><span className="text-[11px] font-semibold text-emerald-300">{delta}</span></div>
  </div>;
}

function AssetCard({ asset, onOpen, onShare }: { asset: Asset; onOpen: (asset: Asset) => void; onShare: (asset: Asset) => void }) {
  const Icon = asset.icon;
  return <div className="asset-card text-left" role="button" tabIndex={0} onClick={() => onOpen(asset)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") onOpen(asset); }}>
    <div className="flex items-start justify-between"><div className={cn("asset-icon", `asset-${asset.accent}`)}><Icon size={20} /></div><button type="button" aria-label={`Share ${asset.name}`} title="Share with team" className="asset-actions-button" onClick={event => { event.stopPropagation(); onShare(asset); }}><MoreHorizontal size={17} /></button></div>
    <div className="mt-5"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{asset.id} · {asset.type}</div><h3 className="mt-2 line-clamp-1 text-[15px] font-semibold text-white">{asset.name}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-500">{asset.team}</p></div>
    <div className="mt-5 flex items-center justify-between"><StatusPill status={asset.status} /><span className="text-[11px] text-slate-500">{asset.version}</span></div>
    <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-slate-500"><span>{asset.usage}</span><span>{asset.updated}</span></div>
  </div>;
}

export default function Home() {
  const auth = useAuth();
  const { user } = auth;
  const [currentLocation, navigate] = useLocation();
  const displayName = user?.name?.trim() || user?.username || "Workspace user";
  const roleLabel = user?.role === "top_manager" ? "Top Manager" : user?.role === "manager" ? "Manager" : "Team Member";
  const visibleNavItems = user?.role === "team_member" ? navItems.filter(item => ["Overview", "Asset library", "My assets", "Shared with me", "Knowledge hub"].includes(item.label)) : user?.role === "manager" ? navItems.filter(item => item.path !== "/admin/users") : navItems.filter(item => item.path !== "/manager/team");
  const visibleGovernanceItems = user?.role === "team_member" ? governanceItems.filter(item => item.label === "Requests") : user?.role === "manager" ? governanceItems.filter(item => !["Audit", "Settings"].includes(item.label)) : governanceItems;
  const liveNotifications = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const liveDashboard = trpc.dashboard.snapshot.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const liveAssets = trpc.assets.list.useQuery({ limit: 24 }, { enabled: Boolean(user), retry: false });
  const markNotificationRead = trpc.notifications.markRead.useMutation({ onSuccess: () => liveNotifications.refetch() });
  const [activeFilter, setActiveFilter] = useState("All types");
  const [lifecycleFilter, setLifecycleFilter] = useState("All statuses");
  const [teamFilter, setTeamFilter] = useState("All teams");
  const [classificationFilter, setClassificationFilter] = useState("All classifications");
  const [sortBy, setSortBy] = useState("Recently updated");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [shareAsset, setShareAsset] = useState<Asset | null>(null);
  const [shareMemberId, setShareMemberId] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "download" | "contribute">("view");
  const [shareNotice, setShareNotice] = useState("");
  const shareMembers = trpc.teams.members.useQuery({ teamId: shareAsset?.team ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(user && shareAsset), retry: false });
  const createShare = trpc.assets.share.useMutation({ onSuccess: () => { setShareNotice("Share created. The selected team member can now access this governed asset."); }, onError: error => setShareNotice(error.message) });
  const shareMemberPlaceholder = shareMembers.isLoading ? "Loading team members..." : shareMembers.isError ? "Unable to load team members" : shareMembers.data && shareMembers.data.length > 0 ? "Select a team member" : "No active members found";
  const [mobileNav, setMobileNav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [listView, setListView] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await auth.logout();
      navigate("/");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to sign out");
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sourceAssets = useMemo(() => (liveAssets.data ?? []).map(toUiAsset), [liveAssets.data]);
  const filteredAssets = useMemo(() => sourceAssets.filter(asset => {
    const matchesType = activeFilter === "All types" || asset.type === activeFilter;
    const matchesLifecycle = lifecycleFilter === "All statuses" || asset.status === lifecycleFilter;
    const matchesTeam = teamFilter === "All teams" || asset.team === teamFilter;
    const classification = asset.status === "Changes requested" ? "Restricted" : asset.status === "Pending review" ? "Confidential" : "Internal";
    const matchesClassification = classificationFilter === "All classifications" || classification === classificationFilter;
    const haystack = `${asset.name} ${asset.owner} ${asset.team} ${asset.technology}`.toLowerCase();
    return matchesType && matchesLifecycle && matchesTeam && matchesClassification && haystack.includes(query.toLowerCase());
  }).sort((a, b) => sortBy === "Name" ? a.name.localeCompare(b.name) : sortBy === "Most used" ? b.usage.localeCompare(a.usage) : 0),[activeFilter, lifecycleFilter, teamFilter, classificationFilter, query, sortBy, sourceAssets]);

  if (auth.loading) return <div className="login-screen"><div className="login-card text-center"><BrandMark className="mx-auto" /><p className="mt-5 text-sm text-slate-400">Loading secure workspace...</p></div></div>;
  if (!auth.isAuthenticated) return <LoginScreen onAuthenticated={auth.refresh} />;

  return <div className="enghub-app">
    <aside className={cn("sidebar", mobileNav && "sidebar-open")}>
      <div className="brand-row"><BrandMark /><div><div className="brand-name">ENGHUB</div><div className="brand-subtitle">Engineering memory</div></div><button onClick={() => setMobileNav(false)} className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden"><X size={18} /></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">N</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">Network Operations</div><div className="mt-0.5 text-[10px] text-slate-500">Engineering workspace</div></div><ChevronDown size={15} className="text-slate-600" /></div>
      <div className="nav-label">Workspace</div><nav className="space-y-1">{visibleNavItems.map(item => { const targetPath = item.label === "Teams" && user?.role !== "top_manager" ? "/workspace/teams" : item.path; const active = targetPath === "/" ? currentLocation === "/" : currentLocation.startsWith(targetPath); return <button key={item.label} onClick={() => { setMobileNav(false); navigate(targetPath); }} className={cn("nav-item", active && "nav-item-active")}><item.icon size={17} /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />}</button>; })}</nav>
      <div className="nav-label mt-7">Governance</div><nav className="space-y-1">{visibleGovernanceItems.map(item => <button key={item.label} onClick={() => { setMobileNav(false); navigate(item.path); }} className={cn("nav-item", currentLocation.startsWith(item.path) && "nav-item-active")}><item.icon size={17} /><span>{item.label}</span>{item.count && <span className="ml-auto rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{item.count}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><div className="flex items-center gap-2 text-[11px] font-semibold text-cyan-200"><ShieldCheck size={15} /> Governed workspace</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Every release is reviewed, traceable and owned.</p></div><div className="profile-row"><div className="profile-avatar">YS</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">{displayName}</div><div className="truncate text-[10px] text-slate-500">{roleLabel} · RAN</div></div><button type="button" aria-label="Sign out" title="Sign out" onClick={handleLogout} disabled={auth.loading} className="logout-button"><LogOut size={15} /><span>Sign out</span></button></div>{logoutError && <p className="mt-2 px-2 text-[10px] text-rose-300">{logoutError}</p>}</div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 lg:hidden"><Menu size={18} /></button><div className="breadcrumb"><span className="text-slate-500">Workspace</span><span className="text-slate-700">/</span><span className="text-slate-200">Overview</span></div></div><div className="topbar-actions"><ThemeSwitcher /><button className="command-search" onClick={() => setCommandOpen(true)}><Search size={15} /><span>Search assets...</span><kbd><Command size={11} /> K</kbd></button><button aria-label="Open notifications" className="top-icon" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={17} /><span className="notification-dot" /></button><button type="button" onClick={handleLogout} disabled={auth.loading} className="top-logout"><LogOut size={14} /><span>Sign out</span></button><Button onClick={() => navigate("/assets/new")} className="create-button"><Plus size={16} /> <span className="hidden sm:inline">Create asset</span></Button></div></header>
      <div className="page-content">
        <div className="live-banner"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" /><span>Live governed workspace</span><span className="text-slate-600">·</span><span className="text-slate-500">PostgreSQL-backed access and activity</span></div>
        <section className="hero-row"><div><div className="eyebrow"><Sparkles size={13} /> Engineering intelligence</div><h1 className="page-title">Good morning, {displayName.split(" ")[0]}<span className="text-cyan-300">.</span></h1><p className="page-lede">A clear view of what your teams are building, reviewing, and putting to work.</p></div><div className="hero-status"><div className="status-orb"><div className="status-orb-inner"><ShieldCheck size={20} /></div></div><div><div className="text-xs font-semibold text-white">Workspace health</div><div className="mt-1 flex items-center gap-2 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> All systems governed</div></div></div></section>
        <section className="metrics-grid"><MetricCard label="Total digital assets" value={(liveDashboard.data?.totalAssets ?? 0).toLocaleString()} delta="Live" icon={FolderKanban} tone="tone-cyan" /><MetricCard label="Active tools" value={(liveDashboard.data?.activeAssets ?? 0).toLocaleString()} delta="Live" icon={Zap} tone="tone-violet" /><MetricCard label="Pending approvals" value={String(liveDashboard.data?.pendingApprovals ?? 0).padStart(2, "0")} delta="Live" icon={FileCheck2} tone="tone-amber" /><MetricCard label="Hours saved this quarter" value={(liveDashboard.data?.hoursSaved ?? 0).toLocaleString()} delta="Impact" icon={Clock3} tone="tone-emerald" /></section>
        {(user?.role === "manager" || user?.role === "top_manager") && <section className="leaderboard-grid mt-4"><div className="panel-surface leaderboard-panel"><div className="section-heading"><div><div className="eyebrow"><Activity size={13} /> Team excellence score</div><h2>Which team is leading?</h2><p className="mt-1 text-xs text-slate-500">A visual ranking of successful releases, activity, and documented hours saved.</p></div><Gauge className="text-cyan-300" size={18} /></div><div className="team-score-chart"><div className="team-score-grid-lines"><span>Top score</span><i /><i /><i /><i /></div><div className="team-score-columns">{(liveDashboard.data?.teamScores ?? []).map((item, index) => { const max = liveDashboard.data?.teamScores?.[0]?.score || 1; const height = Math.max(12, (item.score / max) * 100); return <div key={item.teamId} className="team-score-column" title={`${item.team}: ${item.score} points`}><div className="team-score-value">{item.score}</div><div className="team-score-bar-wrap"><span className={cn("team-score-bar", index === 0 && "team-score-bar-top")} style={{ height: `${height}%` }} /></div><div className="team-score-rank">{String(index + 1).padStart(2, "0")}</div><strong>{item.team}</strong><small>{item.successful} successful · {item.hoursSaved}h</small></div>; })}</div>{!liveDashboard.data?.teamScores?.length && <p className="py-12 text-center text-xs text-slate-500">Team performance data will appear after assets are submitted.</p>}</div></div><div className="panel-surface leaderboard-panel"><div className="section-heading"><div><div className="eyebrow"><Users2 size={13} /> Contributor spotlight</div><h2>Top project contributors</h2><p className="mt-1 text-xs text-slate-500">Employees with the strongest successful delivery record.</p></div><Sparkles className="text-amber-200" size={18} /></div><div className="mt-5 space-y-3">{(liveDashboard.data?.topContributors ?? []).map((item, index) => <div key={item.userId} className="contributor-row"><div className="contributor-medal">{index + 1}</div><div className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{item.user}</strong><span className="text-[10px] text-slate-500">{item.successful} successful · {item.uploads} uploads · {item.hoursSaved}h saved</span></div><span className="text-xs font-bold text-emerald-200">{item.score}</span></div>)}{!liveDashboard.data?.topContributors?.length && <p className="text-xs text-slate-500">Contributor rankings will appear after the first project activity.</p>}</div></div></section>}
        <section className="workspace-grid"><div className="library-panel panel-surface"><div className="section-heading"><div><div className="eyebrow">Curated library</div><h2>Recent assets</h2></div><Link href="/library" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">View library <ArrowUpRight className="ml-1 inline" size={14} /></Link></div><div className="library-toolbar"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input id="asset-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, team, technology..." className="search-input pl-9" /></div><div className="filter-pills hidden xl:flex">{filterTypes.slice(0, 4).map(filter => <button key={filter} onClick={() => setActiveFilter(filter)} className={cn("filter-pill", activeFilter === filter && "filter-pill-active")}>{filter}</button>)}</div><button onClick={() => setShowFilters(!showFilters)} className={cn("filter-button", showFilters && "filter-button-active")}><SlidersHorizontal size={15} /><span className="hidden sm:inline">Filters</span></button><button aria-label={listView ? "Use grid view" : "Use list view"} onClick={() => setListView(!listView)} className={cn("view-button", listView && "view-button-active")}><ListFilter size={16} /></button></div>{showFilters && <div className="advanced-filters"><div><label>Asset type</label><select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}><option>All types</option>{filterTypes.slice(1).map(filter => <option key={filter}>{filter}</option>)}</select></div><div><label>Lifecycle</label><select value={lifecycleFilter} onChange={e => setLifecycleFilter(e.target.value)}><option>All statuses</option><option>Active</option><option>Pending review</option><option>Changes requested</option><option>Draft</option></select></div><div><label>Sort by</label><select value={sortBy} onChange={e => setSortBy(e.target.value)}><option>Recently updated</option><option>Name</option><option>Most used</option></select></div><div><label>Team</label><select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option>All teams</option><option>RAN Engineering</option><option>Core Engineering</option><option>Transport Engineering</option><option>OSS Engineering</option><option>Automation Team</option></select></div><div><label>Classification</label><select value={classificationFilter} onChange={e => setClassificationFilter(e.target.value)}><option>All classifications</option><option>Internal</option><option>Confidential</option><option>Restricted</option></select></div></div>}<div className={cn("asset-grid", listView && "asset-grid-list")}>{filteredAssets.map(asset => <AssetCard key={asset.id} asset={asset} onOpen={setSelected} onShare={assetToShare => { setShareNotice(""); setShareMemberId(""); setShareAsset(assetToShare); }} />)}</div>{filteredAssets.length === 0 && <div className="empty-state"><Search size={25} /><p>No assets match your current filters.</p><button onClick={() => { setQuery(""); setActiveFilter("All types"); setLifecycleFilter("All statuses"); setTeamFilter("All teams"); setClassificationFilter("All classifications"); }} className="text-xs font-semibold text-cyan-300">Clear filters</button></div>}</div>
          <aside className="right-rail"><div className="panel-surface p-6"><div className="eyebrow"><ShieldCheck size={13} /> Live governance feed</div><h2 className="mt-2 text-lg font-semibold text-white">{liveDashboard.isLoading ? "Loading workspace signal" : liveDashboard.isError ? "Database connection required" : "Workspace is governed"}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{liveDashboard.isError ? "Connect ENGHUB_DATABASE_URL to load live metrics and review assignments." : "Review assignments, notifications, and asset activity are scoped to your role and team membership."}</p>{(user?.role === "manager" || user?.role === "top_manager") && <Link href="/workspace/approvals" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200">Open approval center <ArrowUpRight size={14} /></Link>}</div></aside>
        </section>
        <section className="bottom-strip"><div><div className="eyebrow">Operational signal</div><h2>Engineering memory stays in motion.</h2><p>Every asset, review, and decision is recorded against its workspace scope.</p></div><div className="signal-chart"><div className="chart-labels"><span>Access scope</span><strong>{roleLabel}</strong></div><div className="scope-line"><span className="scope-line-active" /><span /><span /><span /></div></div></section>
      </div>
    </main>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="asset-detail-modal" onClick={e => e.stopPropagation()}><button onClick={() => setSelected(null)} className="modal-close"><X size={17} /></button><div className={cn("asset-icon", `asset-${selected.accent}`)}><selected.icon size={22} /></div><div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{liveAssets.data?.find(asset => asset.id === selected.id)?.assetKey || selected.id} · {selected.type}</div><h2 className="mt-2 text-2xl font-semibold text-white">{selected.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">A governed engineering asset owned by {selected.owner}. It is available to the {selected.team} team with its release history and documentation attached.</p><div className="detail-stats"><div><span>Owner</span><strong>{selected.owner}</strong></div><div><span>Version</span><strong>{selected.version}</strong></div><div><span>Technology</span><strong>{selected.technology}</strong></div><div><span>Usage</span><strong>{selected.usage}</strong></div></div><div className="mt-6 flex items-center gap-3"><StatusPill status={selected.status} /><span className="text-xs text-slate-500">Updated {selected.updated}</span></div><div className="detail-context"><div><span>Lifecycle</span><strong>Draft → Review → Approved → Published</strong></div><div><span>Related assets</span><strong>{selected.type === "Tool" ? "2 tools · 1 runbook" : "3 linked assets"}</strong></div><div><span>Files</span><strong>Latest attachment · {selected.version}</strong></div></div><div className="mt-8 flex gap-3"><Button className="create-button flex-1" onClick={() => { setSelected(null); navigate(`/asset/${selected.id}`); }}><FileText size={15} /> Open asset</Button><Button variant="outline" className="secondary-button" onClick={() => setShareAsset(selected)}><Users2 size={15} /></Button><Button variant="outline" className="secondary-button"><MoreHorizontal size={15} /></Button></div></div></div>}
    {shareAsset && <div className="modal-backdrop" onClick={() => setShareAsset(null)}><div className="create-modal share-modal-polished" onClick={e => e.stopPropagation()}><button onClick={() => setShareAsset(null)} className="modal-close"><X size={17} /></button><div className="share-modal-orb"><Users2 size={21} /></div><div className="eyebrow mt-5"><Users2 size={13} /> Team access</div><h2 className="mt-2 text-2xl font-semibold text-white">Share {shareAsset.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">Share directly from Recent assets. The selected team member receives governed access and the action is audited.</p><div className="share-form mt-6"><label>Team member<select value={shareMemberId} onChange={event => setShareMemberId(event.target.value)}><option value="">{shareMemberPlaceholder}</option>{(shareMembers.data ?? []).map(member => <option key={member.id} value={member.id}>{member.name || member.username} · {member.employeeNumber || member.role}</option>)}</select></label><label>Permission<select value={sharePermission} onChange={event => setSharePermission(event.target.value as typeof sharePermission)}><option value="view">View only</option><option value="download">View and download</option><option value="contribute">Contribute</option></select></label></div>{shareNotice && <p className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">{shareNotice}</p>}<Button className="create-button mt-5 w-full" disabled={!shareMemberId || createShare.isPending} onClick={() => { if (!shareMemberId) return; createShare.mutate({ assetId: shareAsset.id, recipientType: "user", recipientUserId: shareMemberId, permission: sharePermission }); }}>{createShare.isPending ? "Creating governed share..." : "Share with member"}<ArrowUpRight size={14} /></Button><p className="mt-3 text-center text-[11px] text-slate-500">Available for approved, published, or active assets.</p></div></div>}
    {commandOpen && <div className="modal-backdrop command-backdrop" onClick={() => setCommandOpen(false)}><div className="command-palette" onClick={e => e.stopPropagation()}><div className="flex items-center gap-3 border-b border-white/[0.07] pb-3"><Search size={16} className="text-cyan-300" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search assets, teams, technology..." /><kbd>ESC</kbd></div><div className="command-results">{filteredAssets.slice(0, 5).map(asset => <button key={asset.id} onClick={() => { setSelected(asset); setCommandOpen(false); }}><span className={cn("asset-icon", `asset-${asset.accent}`)}><asset.icon size={15} /></span><span className="min-w-0 flex-1 text-left"><strong>{asset.name}</strong><small>{asset.id} · {asset.team}</small></span><ArrowUpRight size={14} /></button>)}{filteredAssets.length === 0 && <div className="py-8 text-center text-xs text-slate-500">No matching assets</div>}</div></div></div>}
    {notificationsOpen && <div className="notification-popover"><div className="flex items-center justify-between"><div><div className="eyebrow">Workspace inbox</div><h3 className="mt-1 text-sm font-semibold text-white">Notifications</h3></div><span className="queue-count">03</span></div><div className="notification-list">{user && liveNotifications.isLoading && <div className="py-5 text-center text-xs text-slate-500">Loading workspace inbox...</div>}{user && liveNotifications.isError && <div className="py-5 text-center text-xs text-rose-300">Unable to load notifications.</div>}{user && liveNotifications.data?.length === 0 && <div className="py-5 text-center text-xs text-slate-500">No unread governance updates.</div>}{user && liveNotifications.data?.map(note => <button key={note.id} onClick={() => !note.isRead && markNotificationRead.mutate({ notificationId: note.id })} className="flex gap-2 border-b border-white/[0.06] pb-3 text-left"><span className="notification-bullet bg-cyan-300" /><p><strong>{note.title}</strong><span className="ml-1">{note.body}</span><small>{new Date(note.createdAt).toLocaleString()}</small></p></button>)}{!user && <><div><span className="notification-bullet bg-amber-300" /><p><strong>IPRAN Runbook</strong> is waiting for Manager review.<small>1 hour ago</small></p></div><div><span className="notification-bullet bg-cyan-300" /><p><strong>NCE Configuration Tool</strong> has a new approved version.<small>2 hours ago</small></p></div><div><span className="notification-bullet bg-rose-300" /><p><strong>Network Change SOP</strong> needs requested changes.<small>Yesterday</small></p></div></>}</div><button className="notification-footer" onClick={() => user ? liveNotifications.refetch() : setNotificationsOpen(false)}>Refresh inbox</button></div>}

  </div>;
}
