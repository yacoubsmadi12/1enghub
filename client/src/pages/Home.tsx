import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
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
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
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

const assets: Asset[] = [
  { id: "ENG-1042", name: "Huawei PM Automation", type: "Automation", owner: "Yacoub Smadi", team: "RAN Engineering", version: "v3.4", status: "Active", usage: "184 executions", technology: "Python", updated: "18 min ago", accent: "cyan", icon: Zap },
  { id: "ENG-1038", name: "NCE Configuration Tool", type: "Tool", owner: "Lina Haddad", team: "Core Engineering", version: "v2.1", status: "Active", usage: "92 executions", technology: "Go", updated: "2 hours ago", accent: "violet", icon: Gauge },
  { id: "ENG-1031", name: "IPRAN Troubleshooting Runbook", type: "Runbook", owner: "Omar Khalil", team: "Transport Engineering", version: "v1.8", status: "Pending review", usage: "58 views", technology: "Routing", updated: "Yesterday", accent: "amber", icon: FileText },
  { id: "ENG-1026", name: "OSS Audit Analyzer", type: "Tool", owner: "Maha Saeed", team: "OSS Engineering", version: "v4.0", status: "Active", usage: "311 executions", technology: "TypeScript", updated: "Yesterday", accent: "blue", icon: FileCode2 },
  { id: "ENG-1017", name: "Network Change SOP", type: "SOP", owner: "Kareem Nassar", team: "Security Engineering", version: "v1.2", status: "Changes requested", usage: "41 views", technology: "Governance", updated: "2 days ago", accent: "rose", icon: ShieldCheck },
  { id: "ENG-1009", name: "FTTH Report Automation", type: "Report", owner: "Sara Odeh", team: "Automation Team", version: "v2.7", status: "Draft", usage: "—", technology: "PowerShell", updated: "3 days ago", accent: "emerald", icon: FileCheck2 },
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Asset library", icon: FolderKanban },
  { label: "My assets", icon: GitBranch },
  { label: "Shared with me", icon: Users2 },
  { label: "Teams", icon: Users2 },
  { label: "Knowledge hub", icon: Sparkles },
];
const governanceItems = [
  { label: "Requests", icon: Clock3, count: "08" },
  { label: "Approvals", icon: FileCheck2, count: "04" },
  { label: "Analytics", icon: Activity },
  { label: "Audit", icon: LockKeyhole },
  { label: "Settings", icon: Settings2 },
];
const filterTypes = ["All types", "Automation", "Tool", "Runbook", "SOP", "Report"];

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

function AssetCard({ asset, onOpen }: { asset: Asset; onOpen: (asset: Asset) => void }) {
  const Icon = asset.icon;
  return <button onClick={() => onOpen(asset)} className="asset-card text-left">
    <div className="flex items-start justify-between"><div className={cn("asset-icon", `asset-${asset.accent}`)}><Icon size={20} /></div><MoreHorizontal size={17} className="text-slate-600" /></div>
    <div className="mt-5"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{asset.id} · {asset.type}</div><h3 className="mt-2 line-clamp-1 text-[15px] font-semibold text-white">{asset.name}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-500">{asset.team}</p></div>
    <div className="mt-5 flex items-center justify-between"><StatusPill status={asset.status} /><span className="text-[11px] text-slate-500">{asset.version}</span></div>
    <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-slate-500"><span>{asset.usage}</span><span>{asset.updated}</span></div>
  </button>;
}

export default function Home() {
  const { user } = useAuth();
  const liveNotifications = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const liveDashboard = trpc.dashboard.snapshot.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const markNotificationRead = trpc.notifications.markRead.useMutation({ onSuccess: () => liveNotifications.refetch() });
  const [activeFilter, setActiveFilter] = useState("All types");
  const [lifecycleFilter, setLifecycleFilter] = useState("All statuses");
  const [teamFilter, setTeamFilter] = useState("All teams");
  const [classificationFilter, setClassificationFilter] = useState("All classifications");
  const [sortBy, setSortBy] = useState("Recently updated");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [shareAsset, setShareAsset] = useState<Asset | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [listView, setListView] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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

  const filteredAssets = useMemo(() => assets.filter(asset => {
    const matchesType = activeFilter === "All types" || asset.type === activeFilter;
    const matchesLifecycle = lifecycleFilter === "All statuses" || asset.status === lifecycleFilter;
    const matchesTeam = teamFilter === "All teams" || asset.team === teamFilter;
    const classification = asset.status === "Changes requested" ? "Restricted" : asset.status === "Pending review" ? "Confidential" : "Internal";
    const matchesClassification = classificationFilter === "All classifications" || classification === classificationFilter;
    const haystack = `${asset.name} ${asset.owner} ${asset.team} ${asset.technology}`.toLowerCase();
    return matchesType && matchesLifecycle && matchesTeam && matchesClassification && haystack.includes(query.toLowerCase());
  }).sort((a, b) => sortBy === "Name" ? a.name.localeCompare(b.name) : sortBy === "Most used" ? b.usage.localeCompare(a.usage) : 0),[activeFilter, lifecycleFilter, teamFilter, classificationFilter, query, sortBy]);

  return <div className="enghub-app">
    <aside className={cn("sidebar", mobileNav && "sidebar-open")}>
      <div className="brand-row"><div className="brand-mark"><span>EH</span></div><div><div className="brand-name">ENGHUB</div><div className="brand-subtitle">Engineering memory</div></div><button onClick={() => setMobileNav(false)} className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden"><X size={18} /></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">N</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">Network Operations</div><div className="mt-0.5 text-[10px] text-slate-500">Engineering workspace</div></div><ChevronDown size={15} className="text-slate-600" /></div>
      <div className="nav-label">Workspace</div><nav className="space-y-1">{navItems.map(item => <button key={item.label} className={cn("nav-item", item.active && "nav-item-active")}><item.icon size={17} /><span>{item.label}</span>{item.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />}</button>)}</nav>
      <div className="nav-label mt-7">Governance</div><nav className="space-y-1">{governanceItems.map(item => <button key={item.label} className="nav-item"><item.icon size={17} /><span>{item.label}</span>{item.count && <span className="ml-auto rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{item.count}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><div className="flex items-center gap-2 text-[11px] font-semibold text-cyan-200"><ShieldCheck size={15} /> Governed workspace</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Every release is reviewed, traceable and owned.</p></div><div className="profile-row"><div className="profile-avatar">YS</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">Yacoub Smadi</div><div className="truncate text-[10px] text-slate-500">Team Member · RAN</div></div><MoreHorizontal size={17} className="text-slate-600" /></div></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-lg border border-white/[0.08] p-2 text-slate-400 lg:hidden"><Menu size={18} /></button><div className="breadcrumb"><span className="text-slate-500">Workspace</span><span className="text-slate-700">/</span><span className="text-slate-200">Overview</span></div></div><div className="topbar-actions"><button className="command-search" onClick={() => setCommandOpen(true)}><Search size={15} /><span>Search assets...</span><kbd><Command size={11} /> K</kbd></button><button aria-label="Open notifications" className="top-icon" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={17} /><span className="notification-dot" /></button><Button onClick={() => setShowCreate(true)} className="create-button"><Plus size={16} /> <span className="hidden sm:inline">Create asset</span></Button></div></header>
      <div className="page-content">
        <div className="demo-banner"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" /><span>Demo workspace</span><span className="text-slate-600">·</span><span className="text-slate-500">Connect PostgreSQL to replace sample metrics with live data</span><button className="ml-auto text-slate-500 hover:text-cyan-300">View setup</button></div>
        <section className="hero-row"><div><div className="eyebrow"><Sparkles size={13} /> Engineering intelligence</div><h1 className="page-title">Good morning, Yacoub<span className="text-cyan-300">.</span></h1><p className="page-lede">A clear view of what your teams are building, reviewing, and putting to work.</p></div><div className="hero-status"><div className="status-orb"><div className="status-orb-inner"><ShieldCheck size={20} /></div></div><div><div className="text-xs font-semibold text-white">Workspace health</div><div className="mt-1 flex items-center gap-2 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> All systems governed</div></div></div></section>
        <section className="metrics-grid"><MetricCard label="Total digital assets" value={(liveDashboard.data?.totalAssets ?? 1248).toLocaleString()} delta={liveDashboard.data ? "Live" : "+8.4%"} icon={FolderKanban} tone="tone-cyan" /><MetricCard label="Active tools" value={(liveDashboard.data?.activeAssets ?? 86).toLocaleString()} delta={liveDashboard.data ? "Live" : "+12.1%"} icon={Zap} tone="tone-violet" /><MetricCard label="Pending approvals" value={String(liveDashboard.data?.pendingApprovals ?? 4).padStart(2, "0")} delta={liveDashboard.data ? "Live" : "Needs attention"} icon={FileCheck2} tone="tone-amber" /><MetricCard label="Hours saved this quarter" value="12,840h" delta="+16.8%" icon={Clock3} tone="tone-emerald" /></section>
        <section className="workspace-grid"><div className="library-panel panel-surface"><div className="section-heading"><div><div className="eyebrow">Curated library</div><h2>Recent assets</h2></div><Link href="/library" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">View library <ArrowUpRight className="ml-1 inline" size={14} /></Link></div><div className="library-toolbar"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input id="asset-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, team, technology..." className="search-input pl-9" /></div><div className="filter-pills hidden xl:flex">{filterTypes.slice(0, 4).map(filter => <button key={filter} onClick={() => setActiveFilter(filter)} className={cn("filter-pill", activeFilter === filter && "filter-pill-active")}>{filter}</button>)}</div><button onClick={() => setShowFilters(!showFilters)} className={cn("filter-button", showFilters && "filter-button-active")}><SlidersHorizontal size={15} /><span className="hidden sm:inline">Filters</span></button><button aria-label={listView ? "Use grid view" : "Use list view"} onClick={() => setListView(!listView)} className={cn("view-button", listView && "view-button-active")}><ListFilter size={16} /></button></div>{showFilters && <div className="advanced-filters"><div><label>Asset type</label><select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}><option>All types</option>{filterTypes.slice(1).map(filter => <option key={filter}>{filter}</option>)}</select></div><div><label>Lifecycle</label><select value={lifecycleFilter} onChange={e => setLifecycleFilter(e.target.value)}><option>All statuses</option><option>Active</option><option>Pending review</option><option>Changes requested</option><option>Draft</option></select></div><div><label>Sort by</label><select value={sortBy} onChange={e => setSortBy(e.target.value)}><option>Recently updated</option><option>Name</option><option>Most used</option></select></div><div><label>Team</label><select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}><option>All teams</option><option>RAN Engineering</option><option>Core Engineering</option><option>Transport Engineering</option><option>OSS Engineering</option><option>Security Engineering</option><option>Automation Team</option></select></div><div><label>Classification</label><select value={classificationFilter} onChange={e => setClassificationFilter(e.target.value)}><option>All classifications</option><option>Internal</option><option>Confidential</option><option>Restricted</option></select></div></div>}<div className={cn("asset-grid", listView && "asset-grid-list")}>{filteredAssets.map(asset => <AssetCard key={asset.id} asset={asset} onOpen={setSelected} />)}</div>{filteredAssets.length === 0 && <div className="empty-state"><Search size={25} /><p>No assets match your current filters.</p><button onClick={() => { setQuery(""); setActiveFilter("All types"); setLifecycleFilter("All statuses"); setTeamFilter("All teams"); setClassificationFilter("All classifications"); }} className="text-xs font-semibold text-cyan-300">Clear filters</button></div>}</div>
          <aside className="right-rail"><div className="panel-surface review-panel"><div className="section-heading"><div><div className="eyebrow">Governance queue</div><h2>Review attention</h2></div><span className="queue-count">04</span></div><div className="review-list"><div className="review-item"><div className="review-icon review-amber"><FileCheck2 size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">IPRAN Troubleshooting Runbook</div><div className="mt-1 text-[11px] text-slate-500">Awaiting Manager review</div></div><span className="text-[10px] text-amber-200">1d</span></div><div className="review-item"><div className="review-icon review-cyan"><GitBranch size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">FTTH Report Automation</div><div className="mt-1 text-[11px] text-slate-500">New version submitted</div></div><span className="text-[10px] text-slate-500">3d</span></div><div className="review-item"><div className="review-icon review-rose"><FileText size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">Network Change SOP</div><div className="mt-1 text-[11px] text-slate-500">Changes requested</div></div><span className="text-[10px] text-rose-300">2d</span></div></div><Button variant="outline" className="review-button">Open approval center <ArrowUpRight size={14} /></Button></div><div className="panel-surface activity-panel"><div className="section-heading"><div><div className="eyebrow">Live trail</div><h2>Recent activity</h2></div><Activity size={17} className="text-slate-600" /></div><div className="activity-list"><div className="activity-line"><div className="activity-avatar avatar-cyan">LM</div><div><p><strong>Lina</strong> published <strong>NCE Configuration Tool</strong></p><span>12 minutes ago</span></div></div><div className="activity-line"><div className="activity-avatar avatar-violet">MK</div><div><p><strong>Maha</strong> uploaded a new version</p><span>1 hour ago</span></div></div><div className="activity-line"><div className="activity-avatar avatar-amber">KN</div><div><p><strong>Kareem</strong> requested a review</p><span>Yesterday</span></div></div></div></div></aside>
        </section>
        <section className="bottom-strip"><div><div className="eyebrow">Operational signal</div><h2>Engineering value is compounding.</h2><p>Reusable assets helped teams avoid 1,920 hours of duplicated work this quarter.</p></div><div className="signal-chart"><div className="chart-labels"><span>Hours saved</span><strong>+16.8%</strong></div><div className="bars">{[38, 52, 45, 69, 61, 82, 76, 95].map((height, index) => <span key={index} style={{ height: `${height}%` }} className={cn(index === 7 && "bar-current")} />)}</div></div></section>
      </div>
    </main>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="asset-detail-modal" onClick={e => e.stopPropagation()}><button onClick={() => setSelected(null)} className="modal-close"><X size={17} /></button><div className={cn("asset-icon", `asset-${selected.accent}`)}><selected.icon size={22} /></div><div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{selected.id} · {selected.type}</div><h2 className="mt-2 text-2xl font-semibold text-white">{selected.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">A governed engineering asset owned by {selected.owner}. It is available to the {selected.team} team with its release history and documentation attached.</p><div className="detail-stats"><div><span>Owner</span><strong>{selected.owner}</strong></div><div><span>Version</span><strong>{selected.version}</strong></div><div><span>Technology</span><strong>{selected.technology}</strong></div><div><span>Usage</span><strong>{selected.usage}</strong></div></div><div className="mt-6 flex items-center gap-3"><StatusPill status={selected.status} /><span className="text-xs text-slate-500">Updated {selected.updated}</span></div><div className="detail-context"><div><span>Lifecycle</span><strong>Draft → Review → Approved → Published</strong></div><div><span>Related assets</span><strong>{selected.type === "Tool" ? "2 tools · 1 runbook" : "3 linked assets"}</strong></div><div><span>Files</span><strong>Latest attachment · {selected.version}</strong></div></div><div className="mt-8 flex gap-3"><Button className="create-button flex-1"><FileText size={15} /> Open asset</Button><Button variant="outline" className="secondary-button" onClick={() => setShareAsset(selected)}><Users2 size={15} /></Button><Button variant="outline" className="secondary-button"><MoreHorizontal size={15} /></Button></div></div></div>}
    {shareAsset && <div className="modal-backdrop" onClick={() => setShareAsset(null)}><div className="create-modal" onClick={e => e.stopPropagation()}><button onClick={() => setShareAsset(null)} className="modal-close"><X size={17} /></button><div className="eyebrow"><Users2 size={13} /> Controlled sharing</div><h2 className="mt-2 text-2xl font-semibold text-white">Share {shareAsset.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">Sharing is available after approval and is recorded in the audit trail.</p><div className="share-form"><label>Recipient team<select defaultValue="RAN Engineering"><option>RAN Engineering</option><option>Core Engineering</option><option>Transport Engineering</option><option>OSS Engineering</option></select></label><label>Permission<select defaultValue="View"><option>View</option><option>Download</option><option>Contribute</option></select></label><label className="share-checkbox"><input type="checkbox" /> Notify recipient</label></div><Button className="create-button mt-5 w-full" onClick={() => setShareAsset(null)}>Create governed share <ArrowUpRight size={14} /></Button></div></div>}
    {commandOpen && <div className="modal-backdrop command-backdrop" onClick={() => setCommandOpen(false)}><div className="command-palette" onClick={e => e.stopPropagation()}><div className="flex items-center gap-3 border-b border-white/[0.07] pb-3"><Search size={16} className="text-cyan-300" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search assets, teams, technology..." /><kbd>ESC</kbd></div><div className="command-results">{filteredAssets.slice(0, 5).map(asset => <button key={asset.id} onClick={() => { setSelected(asset); setCommandOpen(false); }}><span className={cn("asset-icon", `asset-${asset.accent}`)}><asset.icon size={15} /></span><span className="min-w-0 flex-1 text-left"><strong>{asset.name}</strong><small>{asset.id} · {asset.team}</small></span><ArrowUpRight size={14} /></button>)}{filteredAssets.length === 0 && <div className="py-8 text-center text-xs text-slate-500">No matching assets</div>}</div></div></div>}
    {notificationsOpen && <div className="notification-popover"><div className="flex items-center justify-between"><div><div className="eyebrow">Workspace inbox</div><h3 className="mt-1 text-sm font-semibold text-white">Notifications</h3></div><span className="queue-count">03</span></div><div className="notification-list">{user && liveNotifications.isLoading && <div className="py-5 text-center text-xs text-slate-500">Loading workspace inbox...</div>}{user && liveNotifications.isError && <div className="py-5 text-center text-xs text-rose-300">Unable to load notifications.</div>}{user && liveNotifications.data?.length === 0 && <div className="py-5 text-center text-xs text-slate-500">No unread governance updates.</div>}{user && liveNotifications.data?.map(note => <button key={note.id} onClick={() => !note.isRead && markNotificationRead.mutate({ notificationId: note.id })} className="flex gap-2 border-b border-white/[0.06] pb-3 text-left"><span className="notification-bullet bg-cyan-300" /><p><strong>{note.title}</strong><span className="ml-1">{note.body}</span><small>{new Date(note.createdAt).toLocaleString()}</small></p></button>)}{!user && <><div><span className="notification-bullet bg-amber-300" /><p><strong>IPRAN Runbook</strong> is waiting for Manager review.<small>1 hour ago</small></p></div><div><span className="notification-bullet bg-cyan-300" /><p><strong>NCE Configuration Tool</strong> has a new approved version.<small>2 hours ago</small></p></div><div><span className="notification-bullet bg-rose-300" /><p><strong>Network Change SOP</strong> needs requested changes.<small>Yesterday</small></p></div></>}</div><button className="notification-footer" onClick={() => user ? liveNotifications.refetch() : setNotificationsOpen(false)}>Refresh inbox</button></div>}
    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="create-modal" onClick={e => e.stopPropagation()}><button onClick={() => setShowCreate(false)} className="modal-close"><X size={17} /></button><div className="eyebrow"><Plus size={13} /> Quick create</div><h2 className="mt-2 text-2xl font-semibold text-white">Add engineering value</h2><p className="mt-2 text-sm text-slate-400">Start a governed asset. Team Member submissions remain private until the Manager approves them.</p><div className="create-options">{["Tool", "Automation", "Documentation", "Runbook", "SOP", "Knowledge article"].map((label, i) => <button key={label} onClick={() => setShowCreate(false)} className="create-option"><span className={cn("create-option-icon", i % 2 ? "asset-violet" : "asset-cyan")}><FileText size={16} /></span><span>{label}</span><ArrowUpRight size={14} className="ml-auto text-slate-600" /></button>)}</div></div></div>}
  </div>;
}
