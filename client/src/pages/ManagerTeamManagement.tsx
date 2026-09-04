import BrandMark from "@/components/BrandMark";
import { useEffect, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, Plus, Save, ShieldCheck, UploadCloud, UsersRound, X } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type MemberForm = { employeeNumber: string; name: string; username: string; email: string; temporaryPassword: string; teamId: string };
const emptyForm: MemberForm = { employeeNumber: "", name: "", username: "", email: "", temporaryPassword: "", teamId: "" };

function toBase64(file: File) {
  return file.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...Array.from(bytes.subarray(index, Math.min(index + chunkSize, bytes.length))));
    return btoa(binary);
  });
}

function downloadTemplate() {
  const csv = [
    "Employee Number,Full Name,Manager Number,Manager Name,user name,password,Email Address,Team Name",
    "1002,Example Employee,1001,Example Manager,example.employee,employee.password,employee@company.com,Engineering Team",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "enghub-team-members-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ManagerTeamManagement() {
  const { user, loading } = useAuth();
  const teams = trpc.manager.listMyTeams.useQuery(undefined, { enabled: user?.role === "manager", retry: false });
  const members = trpc.manager.listMyTeamMembers.useQuery(undefined, { enabled: user?.role === "manager", retry: false });
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!form.teamId && teams.data?.[0]?.id) setForm(current => ({ ...current, teamId: teams.data![0].id }));
  }, [form.teamId, teams.data]);

  const createMember = trpc.manager.createTeamMember.useMutation({
    onSuccess: () => { setForm(emptyForm); setFormOpen(false); setNotice("Team member created successfully."); setError(""); void members.refetch(); },
    onError: mutationError => setError(mutationError.message),
  });
  const importMembers = trpc.manager.importTeamMembers.useMutation({
    onSuccess: result => { setNotice(`${result.imported} team member${result.imported === 1 ? "" : "s"} imported successfully.`); setError(""); void members.refetch(); },
    onError: mutationError => setError(mutationError.message),
    onSettled: () => setImporting(false),
  });
  const update = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => setForm(current => ({ ...current, [key]: value }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !form.teamId) return;
    setNotice(""); setError(""); setImporting(true);
    try {
      importMembers.mutate({ teamId: form.teamId, fileName: file.name, dataBase64: await toBase64(file) });
    } catch {
      setImporting(false); setError("The Excel file could not be prepared in the browser.");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-400">Loading access policy...</div>;
  if (!user || user.role !== "manager") return <div className="min-h-screen bg-[#080f19] p-8 text-sm text-rose-300"><Link href="/" className="text-cyan-300">Return to ENGHUB</Link><p className="mt-6">Team member management is restricted to Managers.</p></div>;

  return <div className="min-h-screen bg-[#080f19] text-slate-200">
    <header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between"><div className="flex items-center gap-3"><BrandMark /><div><div className="brand-name">ENGHUB</div><div className="text-[10px] text-slate-500">Team access console</div></div></div><Link href="/" className="text-xs text-cyan-300">Back to workspace</Link></div></header>
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="eyebrow"><ShieldCheck size={13} /> Team access governance</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-white">My team members</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Create accounts only for employees who report directly to you. Top Managers retain organization-wide control.</p></div><Button onClick={() => { setFormOpen(open => !open); setNotice(""); setError(""); }} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Plus size={15} /> {formOpen ? "Close form" : "Create team member"}</Button></div>
      {notice && <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="mt-5 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="panel-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow"><FileSpreadsheet size={13} /> Bulk team onboarding</div><h2 className="mt-2 text-lg font-semibold text-white">Import your team from Excel</h2><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">Use the required columns: Employee Number, Full Name, Manager Number, Manager Name, user name, password, and Email Address. Each row must identify you as its direct manager.</p></div><Button variant="outline" onClick={downloadTemplate}><Download size={14} /> Template</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-xs text-slate-400">Team destination<select value={form.teamId} onChange={event => update("teamId", event.target.value)} disabled={teams.isLoading || !teams.data?.length} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200"><option value="" disabled>Select a team</option>{teams.data?.map(team => <option key={team.id} value={team.id}>{team.name} ({team.code})</option>)}</select></label><label className="flex h-10 cursor-pointer items-center justify-center gap-2 self-end rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/20"><UploadCloud size={15} /> {importing ? "Importing..." : "Choose Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing || !form.teamId} className="hidden" /></label></div></div>
        <div className="panel-surface p-5"><div className="eyebrow"><ShieldCheck size={13} /> Scope boundary</div><h2 className="mt-2 text-lg font-semibold text-white">Manager-only creation</h2><p className="mt-2 text-xs leading-5 text-slate-500">The server enforces your team membership and writes the direct manager relation. Passwords are hashed before storage and never returned.</p><div className="mt-5 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] p-3 text-xs text-cyan-100">{teams.data?.length ?? 0} assigned team{teams.data?.length === 1 ? "" : "s"} · {members.data?.length ?? 0} direct member{members.data?.length === 1 ? "" : "s"}</div></div>
      </section>

      {formOpen && <section className="panel-surface mt-6 p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Create a team member</h2><p className="mt-1 text-xs text-slate-500">The account is assigned to you and the selected team automatically.</p></div><Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}><X size={16} /></Button></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{([ ["Employee Number", "employeeNumber", "e.g. 1002"], ["Full name", "name", "Full name"], ["Username", "username", "e.g. engineer.smith"], ["Email", "email", "name@company.com"], ["Temporary password", "temporaryPassword", "At least 8 characters"] ] as const).map(([label, key, placeholder]) => <label key={key} className="text-xs text-slate-400">{label}<input required={key !== "email"} type={key === "temporaryPassword" ? "password" : "text"} value={form[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/50" /></label>)}</div><div className="mt-5 flex justify-end"><Button disabled={createMember.isPending || !form.teamId} onClick={() => createMember.mutate({ ...form, email: form.email || undefined })}><Save size={15} /> {createMember.isPending ? "Creating..." : "Create account"}</Button></div></section>}

      <section className="panel-surface mt-6 overflow-hidden"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-white">Direct team members</h2><p className="mt-1 text-xs text-slate-500">Only employees whose managerId is your account appear here.</p></div><Badge className="border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">{members.data?.length ?? 0} members</Badge></div>{members.isLoading ? <div className="p-8 text-center text-xs text-slate-500">Loading team members...</div> : members.isError ? <div className="p-8 text-center text-xs text-rose-300">Unable to load team members.</div> : members.data?.length ? <div className="divide-y divide-white/[0.06]">{members.data.map(member => <div key={member.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"><div><strong className="block text-sm text-slate-200">{member.name || "Unnamed employee"}</strong><span className="text-xs text-slate-500">{member.username || "No username"}</span></div><div className="text-xs text-slate-400"><span className="block text-[10px] uppercase tracking-wider text-slate-600">Employee Number</span>{member.employeeNumber || "—"}</div><div className="text-xs text-slate-400"><span className="block text-[10px] uppercase tracking-wider text-slate-600">Email</span>{member.email || "—"}</div><Badge className={member.isActive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-rose-400/20 bg-rose-400/10 text-rose-200"}>{member.isActive ? "ACTIVE" : "DISABLED"}</Badge></div>)}</div> : <div className="p-8 text-center text-xs text-slate-500">No direct team members yet. Create one manually or import the Excel template.</div>}</section>
    </main>
  </div>;
}
