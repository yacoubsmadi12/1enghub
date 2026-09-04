import BrandMark from "@/components/BrandMark";
import { useMemo, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, KeyRound, Plus, Save, Search, ShieldCheck, Trash2, UploadCloud, UserRound, UsersRound, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const roleLabels = { top_manager: "Top Manager", manager: "Manager", team_member: "Team Member" } as const;
type Role = keyof typeof roleLabels;
type FormState = { employeeNumber: string; username: string; name: string; email: string; role: Role; temporaryPassword: string; managerId: string; teamId: string; isActive: boolean };
const emptyForm: FormState = { employeeNumber: "", username: "", name: "", email: "", role: "team_member", temporaryPassword: "", managerId: "", teamId: "", isActive: true };

type AdminUser = { id: string; username: string | null; employeeNumber: string | null; managerId: string | null; managerName?: string | null; teamId?: string | null; teamName?: string | null; name: string | null; email: string | null; role: Role; isActive: boolean };
type AdminTeam = { id: string; name: string; code: string; isActive?: boolean };

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
    "1001,Example Manager,,,manager,manager.password,manager@company.com,Engineering Team",
    "1002,Example Employee,1001,Example Manager,example.employee,employee.password,employee@company.com,Engineering Team",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "enghub-users-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function UserManagement() {
  const { user, loading } = useAuth();
  const users = trpc.administration.listUsers.useQuery(undefined, { enabled: user?.role === "top_manager", retry: false });
  const teams = trpc.administration.listTeams.useQuery(undefined, { enabled: user?.role === "top_manager", retry: false });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const managers = useMemo(() => (users.data ?? []).filter(member => member.role === "manager"), [users.data]);
  const refresh = () => { void users.refetch(); };
  const createUser = trpc.administration.createUser.useMutation({ onSuccess: () => { setForm(emptyForm); setFormOpen(false); setNotice("User created successfully."); setError(""); refresh(); }, onError: mutationError => setError(mutationError.message) });
  const importUsers = trpc.administration.importUsers.useMutation({ onSuccess: result => { setNotice(`${result.imported} accounts imported: ${result.managers} managers, ${result.teamMembers} team members, ${result.teams} teams.`); setError(""); refresh(); }, onError: mutationError => setError(mutationError.message), onSettled: () => setImporting(false) });
  const updateUser = trpc.administration.updateUser.useMutation({ onSuccess: () => { setNotice("User updated successfully."); setError(""); refresh(); }, onError: mutationError => setError(mutationError.message) });
  const resetPassword = trpc.administration.resetPassword.useMutation({ onSuccess: () => { setNotice("Password reset successfully. Share the temporary password securely."); setError(""); }, onError: mutationError => setError(mutationError.message) });
  const setActive = trpc.administration.setActive.useMutation({ onSuccess: () => { setNotice("Account status updated."); setError(""); refresh(); }, onError: mutationError => setError(mutationError.message) });
  const assignTeam = trpc.administration.assignTeam.useMutation({ onSuccess: () => { setNotice("Team assignment updated."); setError(""); }, onError: mutationError => setError(mutationError.message) });
  const deleteUser = trpc.administration.deleteUser.useMutation({ onSuccess: () => { setNotice("User and linked governed records deleted."); setError(""); refresh(); }, onError: mutationError => setError(mutationError.message) });
  const deleteUsers = trpc.administration.deleteUsers.useMutation({ onSuccess: result => { setNotice(`${result.deleted} users deleted successfully.`); setError(""); setSelectedIds([]); refresh(); }, onError: mutationError => setError(mutationError.message) });

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users.data ?? []).filter(member => {
      const matchesSearch = !query || [member.employeeNumber, member.username, member.name, member.email].some(value => value?.toLowerCase().includes(query));
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? member.isActive : !member.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users.data, search, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every(member => selectedIds.includes(member.id));
  const toggleSelected = (userId: string) => setSelectedIds(previous => previous.includes(userId) ? previous.filter(id => id !== userId) : [...previous, userId]);
  const toggleAllVisible = () => setSelectedIds(previous => allVisibleSelected ? previous.filter(id => !visibleUsers.some(member => member.id === id)) : Array.from(new Set([...previous, ...visibleUsers.map(member => member.id)])));
  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(previous => ({ ...previous, [key]: value }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNotice(""); setError(""); setImporting(true);
    try {
      importUsers.mutate({ fileName: file.name, dataBase64: await toBase64(file) });
    } catch {
      setImporting(false); setError("The Excel file could not be prepared in the browser.");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-400">Loading access policy...</div>;
  if (!user || user.role !== "top_manager") return <div className="min-h-screen bg-[#080f19] p-8 text-sm text-rose-300"><Link href="/" className="text-cyan-300">Return to ENGHUB</Link><p className="mt-6">User management is restricted to Top Managers.</p></div>;

  return <div className="min-h-screen bg-[#080f19] text-slate-200">
    <header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between"><div className="flex items-center gap-3"><BrandMark /><div><div className="brand-name">ENGHUB</div><div className="text-[10px] text-slate-500">Governance console</div></div></div><Link href="/" className="text-xs text-cyan-300">Back to workspace</Link></div></header>
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="eyebrow"><ShieldCheck size={13} /> Access governance</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-white">User Management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Create accounts, import complete teams, assign direct managers, and maintain an auditable access boundary.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate}><Download size={14} /> Excel template</Button><Button onClick={() => { setFormOpen(open => !open); setNotice(""); setError(""); }} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Plus size={15} /> {formOpen ? "Close form" : "Create user"}</Button></div></div>
      {notice && <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="mt-5 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <section className="panel-surface mt-6 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow"><FileSpreadsheet size={13} /> Bulk onboarding</div><h2 className="mt-2 text-lg font-semibold text-white">Import users and teams from Excel</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">Required columns: Employee Number, Full Name, Manager Number, Manager Name, user name, password, and Email Address. Team Name is optional; when present, teams are created or reused automatically. A row referenced by another employee becomes a Manager; its direct reports become Team Members.</p></div><label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/20"><UploadCloud size={15} /> {importing ? "Importing..." : "Choose Excel file"}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} className="hidden" /></label></div><div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><span>Supports .xlsx, .xls, and .csv</span><span className="text-slate-700">·</span><span>Maximum 5 MB</span><span className="text-slate-700">·</span><span>All rows are validated before the transaction is committed</span></div></section>

      {formOpen && <section className="panel-surface mt-6 p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Create user</h2><p className="mt-1 text-xs text-slate-500">The temporary password is hashed server-side and never returned by the API.</p></div><Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}><X size={16} /></Button></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{([ ["Employee Number", "employeeNumber", "e.g. 1002"], ["Username", "username", "e.g. engineer.smith"], ["Full name", "name", "Full name"], ["Email", "email", "name@company.com"], ["Temporary password", "temporaryPassword", "At least 8 characters"] ] as const).map(([label, key, placeholder]) => <label key={key} className="text-xs text-slate-400">{label}<input required={key !== "email"} type={key === "temporaryPassword" ? "password" : "text"} value={form[key]} onChange={event => updateForm(key, event.target.value)} placeholder={placeholder} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/50" /></label>)}<label className="text-xs text-slate-400">Role<select value={form.role} onChange={event => updateForm("role", event.target.value as Role)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200"><option value="top_manager">Top Manager</option><option value="manager">Manager</option><option value="team_member">Team Member</option></select></label><label className="text-xs text-slate-400">Direct manager<select value={form.managerId} onChange={event => updateForm("managerId", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200"><option value="">No direct manager</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name || manager.username} · {manager.employeeNumber || "No number"}</option>)}</select></label><label className="text-xs text-slate-400">Team<select value={form.teamId} onChange={event => updateForm("teamId", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#0e1928] px-3 text-sm text-slate-200"><option value="">No team assignment</option>{teams.data?.map(team => <option key={team.id} value={team.id}>{team.name} ({team.code})</option>)}</select></label></div><div className="mt-5 flex items-center justify-between gap-4"><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={form.isActive} onChange={event => updateForm("isActive", event.target.checked)} /> Active account</label><Button disabled={createUser.isPending} onClick={() => createUser.mutate({ ...form, employeeNumber: form.employeeNumber || undefined, email: form.email || undefined, managerId: form.managerId || undefined, teamId: form.teamId || undefined })}><Save size={15} /> {createUser.isPending ? "Creating..." : "Create account"}</Button></div></section>}

      <div className="mt-8 grid gap-4 md:grid-cols-4"><div className="panel-surface p-5"><UserRound size={18} className="text-cyan-300" /><strong className="mt-4 block text-2xl text-white">{users.data?.length ?? 0}</strong><span className="text-xs text-slate-500">Registered users</span></div><div className="panel-surface p-5"><UsersRound size={18} className="text-violet-300" /><strong className="mt-4 block text-2xl text-white">{users.data?.filter(item => item.role === "manager").length ?? 0}</strong><span className="text-xs text-slate-500">Managers</span></div><div className="panel-surface p-5"><UsersRound size={18} className="text-amber-300" /><strong className="mt-4 block text-2xl text-white">{users.data?.filter(item => item.managerId).length ?? 0}</strong><span className="text-xs text-slate-500">Reporting lines</span></div><div className="panel-surface p-5"><ShieldCheck size={18} className="text-emerald-300" /><strong className="mt-4 block text-2xl text-white">{users.data?.filter(item => item.isActive).length ?? 0}</strong><span className="text-xs text-slate-500">Active accounts</span></div></div>

      <section className="panel-surface mt-6 overflow-hidden"><div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-4"><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /> Select visible</label>{selectedIds.length > 0 && <Button size="sm" variant="outline" className="border-rose-400/20 text-rose-200" disabled={deleteUsers.isPending} onClick={() => { if (window.confirm(`Delete or disable ${selectedIds.length} selected users?`)) deleteUsers.mutate({ userIds: selectedIds }); }}><Trash2 size={13} /> Delete selected ({selectedIds.length})</Button>}<div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search employee number, name, username, or email..." className="h-9 w-full rounded-md border border-white/10 bg-[#0e1928] pl-9 pr-3 text-xs text-slate-200 outline-none" /></div><select value={roleFilter} onChange={event => { setRoleFilter(event.target.value as typeof roleFilter); setPage(1); }} className="h-9 rounded-md border border-white/10 bg-[#0e1928] px-3 text-xs text-slate-300"><option value="all">All roles</option><option value="top_manager">Top Manager</option><option value="manager">Manager</option><option value="team_member">Team Member</option></select><select value={statusFilter} onChange={event => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} className="h-9 rounded-md border border-white/10 bg-[#0e1928] px-3 text-xs text-slate-300"><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></div><div className="divide-y divide-white/[0.06]">{users.isLoading && <div className="p-8 text-center text-xs text-slate-500">Loading members...</div>}{users.isError && <div className="p-8 text-center text-xs text-rose-300">Unable to load members. Check PostgreSQL configuration.</div>}{visibleUsers.map(member => <ManagedUserRow key={member.id} member={member} managers={managers} teams={teams.data ?? []} selected={selectedIds.includes(member.id)} onSelect={() => toggleSelected(member.id)} onSave={(employeeNumber, managerId, name, email, role, isActive) => updateUser.mutate({ userId: member.id, employeeNumber: employeeNumber || undefined, managerId: managerId || undefined, name, email: email || undefined, role, isActive })} onReset={() => { const password = window.prompt(`New temporary password for ${member.username ?? member.name ?? "user"}`); if (password) resetPassword.mutate({ userId: member.id, temporaryPassword: password }); }} onToggle={() => setActive.mutate({ userId: member.id, isActive: !member.isActive })} onAssign={teamId => assignTeam.mutate({ userId: member.id, teamId, isPrimary: true })} onDelete={() => { if (window.confirm(`Delete ${member.username ?? member.name ?? "this user"}? This cannot be undone.`)) deleteUser.mutate({ userId: member.id }); }} />)}{!users.isLoading && visibleUsers.length === 0 && <div className="p-8 text-center text-xs text-slate-500">No users match your filters.</div>}</div><div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3 text-xs text-slate-500"><span>Showing {visibleUsers.length} of {filteredUsers.length}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Rows <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-200"><option value="8">8</option><option value="16">16</option><option value="32">32</option><option value="64">64</option></select></label><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span>Page {page} / {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>Next</Button></div></div></section>
    </main>
  </div>;
}

function ManagedUserRow({ member, managers, teams, selected, onSelect, onSave, onReset, onToggle, onAssign, onDelete }: { member: AdminUser; managers: AdminUser[]; teams: AdminTeam[]; selected: boolean; onSelect: () => void; onSave: (employeeNumber: string, managerId: string, name: string, email: string, role: Role, isActive: boolean) => void; onReset: () => void; onToggle: () => void; onAssign: (teamId: string) => void; onDelete: () => void }) {
  const [employeeNumber, setEmployeeNumber] = useState(member.employeeNumber ?? "");
  const [name, setName] = useState(member.name ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [managerId, setManagerId] = useState(member.managerId ?? "");
  const [role, setRole] = useState<Role>(member.role);
  return <div className="grid gap-4 px-5 py-4 xl:grid-cols-[auto_1.15fr_1.25fr_1fr_1.15fr_1.05fr_auto] xl:items-center"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${member.username || member.name || "user"}`} /><div className="flex items-center gap-3"><div className="profile-avatar">{(name || member.username || "U").slice(0, 2).toUpperCase()}</div><div><strong className="block text-sm text-slate-200">{name || "Full name not recorded"}</strong><span className="block text-[10px] text-slate-500">{member.username || "No username"} · {employeeNumber || "No employee number"}</span><span className="block max-w-[190px] truncate text-[10px] text-cyan-200/70">{member.teamName || "No team assigned"}</span><Badge className={member.isActive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-rose-400/20 bg-rose-400/10 text-rose-200"}>{member.isActive ? "ACTIVE" : "DISABLED"}</Badge></div></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><input aria-label="Employee Number" value={employeeNumber} onChange={event => setEmployeeNumber(event.target.value)} placeholder="Employee Number" className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-200" /><input aria-label="Full name" value={name} onChange={event => setName(event.target.value)} placeholder="Full name" className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-200" /><input aria-label="Email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-200" /></div><select aria-label="Role" value={role} onChange={event => setRole(event.target.value as Role)} className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-300"><option value="top_manager">Top Manager</option><option value="manager">Manager</option><option value="team_member">Team Member</option></select><select aria-label="Direct manager" value={managerId} onChange={event => setManagerId(event.target.value)} className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-300"><option value="">No direct manager</option>{managers.filter(manager => manager.id !== member.id).map(manager => <option key={manager.id} value={manager.id}>{manager.name || manager.username}</option>)}</select><select aria-label="Team" value={member.teamId ?? ""} onChange={event => event.target.value && onAssign(event.target.value)} className="h-8 rounded-md border border-white/10 bg-[#0e1928] px-2 text-xs text-slate-300"><option value="">{member.teamName || "Assign team..."}</option>{teams.filter(team => team.id !== member.teamId).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select><div className="flex flex-wrap gap-2 xl:justify-end"><Button size="sm" variant="outline" title="Save profile, role, and reporting line" onClick={() => onSave(employeeNumber, managerId, name, email, role, member.isActive)}><Save size={13} /></Button><Button size="sm" variant="outline" title="Reset password" onClick={onReset}><KeyRound size={13} /></Button><Button size="sm" variant="outline" onClick={onToggle}>{member.isActive ? "Disable" : "Activate"}</Button><Button size="sm" variant="outline" title="Delete user" className="border-rose-400/20 text-rose-200 hover:bg-rose-400/10" onClick={onDelete}><Trash2 size={13} /></Button></div></div>;
}
