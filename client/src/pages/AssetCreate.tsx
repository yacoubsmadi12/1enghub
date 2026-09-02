import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Archive, ArrowLeft, CheckCircle2, Database, FileCode2, FileUp, GitBranch, Info, LockKeyhole, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type UploadedFile = {
  fileKey: string;
  fileUrl: string;
  fileName: string;
  relativePath?: string;
  fileRole: "archive" | "project_file";
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

type UploadedProject = {
  file: UploadedFile;
  project: {
    format: "zip" | "rar" | "file";
    isArchive: boolean;
    archiveName: string;
    fileCount: number;
    totalBytes: number;
    files: Array<UploadedFile & { relativePath: string; fileRole: "project_file" }>;
  };
};

const MAX_PROJECT_SIZE = 25 * 1024 * 1024;
const projectTypes = [
  { value: "source_code", label: "Source code", hint: "Repository, application, or service" },
  { value: "tool", label: "Engineering tool", hint: "Utility used by the engineering team" },
  { value: "script", label: "Script", hint: "Python, shell, PowerShell, or similar" },
  { value: "automation", label: "Automation", hint: "Workflow, job, or repeatable process" },
  { value: "documentation", label: "Documentation", hint: "README, guide, or technical reference" },
  { value: "config_template", label: "Configuration", hint: "Template or deployment configuration" },
];
const classifications = [
  { value: "internal", label: "Internal", hint: "Available to approved ENGHUB members" },
  { value: "confidential", label: "Confidential", hint: "Restricted to the selected team" },
  { value: "restricted", label: "Restricted", hint: "Requires explicit governed access" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function projectNameFromFile(fileName: string) {
  return fileName
    .replace(/\.(tar\.gz|tgz|zip|tar|7z|rar)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase())
    .trim();
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(index, Math.min(index + chunkSize, bytes.length))));
  }
  return btoa(binary);
}

async function sha256(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export default function AssetCreate() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const teams = trpc.teams.available.useQuery(undefined, { staleTime: 30_000 });
  const upload = trpc.assets.upload.useMutation();
  const submit = trpc.assets.submit.useMutation({ onSuccess: result => navigate(`/asset/${result.assetId}`) });
  const [form, setForm] = useState({ name: "", summary: "", description: "", businessValue: "", estimatedHoursSaved: "0", estimatedCostSaved: "0", purpose: "", usage: "", installation: "", troubleshooting: "", type: "source_code", classification: "internal", homeTeamId: "", technology: "", version: "0.1.0", tags: "" });
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [uploadedProject, setUploadedProject] = useState<UploadedProject | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!form.homeTeamId && teams.data?.[0]?.id) update("homeTeamId", teams.data[0].id);
  }, [form.homeTeamId, teams.data]);

  if (loading) return <div className="login-screen"><div className="login-card text-center"><p className="text-sm text-slate-400">Loading secure workspace...</p></div></div>;
  if (!isAuthenticated) return <div className="login-screen"><div className="login-card text-center"><ShieldCheck className="mx-auto text-cyan-300" /><h1 className="mt-4 text-xl font-semibold text-white">Internal access required</h1><Link href="/" className="mt-5 inline-block text-sm text-cyan-300">Return to sign in</Link></div></div>;

  const handleProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setProjectFile(selected);
    setUploadedProject(null);
    setUploadError("");
    if (selected.size > MAX_PROJECT_SIZE) {
      setProjectFile(null);
      setUploadError("Projects are limited to 25 MB in this workspace. Compress the repository as .zip or .tar.gz and try again.");
      return;
    }
    setIsPreparing(true);
    try {
      const buffer = await selected.arrayBuffer();
      const checksumSha256 = await sha256(buffer);
      const contentType = selected.type || (selected.name.toLowerCase().endsWith(".zip") ? "application/zip" : "application/octet-stream");
      upload.mutate({ fileName: selected.name, contentType, sizeBytes: selected.size, ...(checksumSha256 ? { checksumSha256 } : {}), dataBase64: bytesToBase64(buffer) }, {
        onSuccess: result => {
          setUploadedProject(result);
          if (!form.name) update("name", projectNameFromFile(selected.name));
          if (!form.summary) update("summary", `Initial project upload: ${selected.name}`);
        },
        onError: error => setUploadError(error.message),
        onSettled: () => setIsPreparing(false),
      });
    } catch {
      setIsPreparing(false);
      setUploadError("The project could not be prepared in the browser. Please try the archive again.");
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!uploadedProject) {
      setUploadError("Upload the project first. ENGHUB creates the asset only after the file is safely stored.");
      return;
    }
    submit.mutate({
      name: form.name,
      summary: form.summary || undefined,
      description: form.description || undefined,
      businessValue: form.businessValue || undefined,
      estimatedHoursSaved: Number(form.estimatedHoursSaved) || 0,
      estimatedCostSaved: Number(form.estimatedCostSaved) || 0,
      document: { purpose: form.purpose || undefined, usage: form.usage || undefined, installation: form.installation || undefined, troubleshooting: form.troubleshooting || undefined },
      type: form.type as never,
      classification: form.classification as never,
      homeTeamId: form.homeTeamId,
      technology: form.technology || undefined,
      version: form.version,
      tags: form.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      file: uploadedProject.file,
      project: uploadedProject.project,
    });
  };

  const selectedType = projectTypes.find(type => type.value === form.type) ?? projectTypes[0];
  const selectedClassification = classifications.find(item => item.value === form.classification) ?? classifications[0];

  return <div className="create-page min-h-screen bg-[#07111f] px-4 py-7 text-slate-200 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="create-topbar"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-cyan-300"><ArrowLeft size={15} /> Back to workspace</Link><div className="create-breadcrumb"><GitBranch size={13} /> New governed project</div><div className="hidden items-center gap-2 text-[10px] text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Signed in as {user?.name}</div></div>
      <header className="create-hero"><div><div className="eyebrow"><UploadCloud size={13} /> Repository-style submission</div><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Create engineering asset<span className="text-cyan-300">.</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Upload your project once. ENGHUB stores the file in secure object storage, registers its metadata in PostgreSQL, and sends the first version to Manager review.</p></div><div className="create-status"><span className="create-status-dot" /><div><strong>Ready to commit</strong><span>Protected project intake</span></div></div></header>

      <div className="create-process"><div><span>01</span><strong>Upload project</strong><p>Choose a .zip, .rar, .tar.gz, or project file.</p></div><div><span>02</span><strong>Describe repository</strong><p>Name, type, team, and visibility.</p></div><div><span>03</span><strong>Request review</strong><p>Manager reviews before publication.</p></div></div>

      <form onSubmit={handleSubmit} className="create-grid">
        <div className="create-main-column">
          <section className="repo-card upload-card"><div className="section-title-row"><div><div className="section-kicker"><Archive size={13} /> Project files</div><h2>Upload your project</h2><p>Like a repository upload: package the project as ZIP or RAR and ENGHUB will unpack the files, keep bytes outside PostgreSQL, and register the manifest.</p></div><span className="size-limit">25 MB max</span></div><label className={`project-dropzone ${projectFile ? "project-dropzone-filled" : ""}`}><input type="file" accept=".zip,.tar,.gz,.tgz,.7z,.rar,.py,.js,.ts,.sh,.yaml,.yml,.md,.pdf" onChange={handleProjectFile} /><div className="upload-icon"><FileUp size={22} /></div><div className="upload-copy"><strong>{projectFile ? projectFile.name : "Choose a project file"}</strong><span>{projectFile ? `${formatBytes(projectFile.size)} · ${projectFile.type || "application/octet-stream"}` : "ZIP or RAR archive recommended · ENGHUB unpacks the project automatically"}</span></div><span className="upload-action">{isPreparing || upload.isPending ? "Uploading..." : projectFile ? "Replace" : "Browse files"}</span></label>{uploadError && <p className="form-error"><Info size={14} />{uploadError}</p>}{uploadedProject && <><div className="uploaded-proof"><div className="proof-icon"><CheckCircle2 size={17} /></div><div className="min-w-0 flex-1"><strong>{uploadedProject.project.isArchive ? `${uploadedProject.project.format.toUpperCase()} project unpacked` : "Project stored securely"}</strong><span>{uploadedProject.project.fileCount} file{uploadedProject.project.fileCount === 1 ? "" : "s"} · {formatBytes(uploadedProject.project.totalBytes)} unpacked · Archive {formatBytes(uploadedProject.file.sizeBytes)}</span></div><span className="proof-badge">Ready</span></div><div className="project-manifest"><div className="manifest-heading"><span>Project manifest</span><span>{uploadedProject.project.fileCount} files</span></div><div className="manifest-list">{uploadedProject.project.files.slice(0, 8).map(file => <div key={file.relativePath}><FileCode2 size={13} /><span>{file.relativePath}</span><small>{formatBytes(file.sizeBytes)}</small></div>)}{uploadedProject.project.fileCount > 8 && <p>+ {uploadedProject.project.fileCount - 8} more files stored with this version</p>}</div></div></>}</section>

          <section className="repo-card"><div className="section-kicker"><FileCode2 size={13} /> Repository details</div><h2>Tell the workspace what this is</h2><p className="section-help">These details become the project card, version record, and review request. No UUIDs or storage URLs are needed.</p><div className="mt-6 grid gap-5"><label className="field-label">Project name<Input required minLength={3} value={form.name} onChange={event => update("name", event.target.value)} placeholder="e.g. RAN Configuration Validator" /></label><label className="field-label">What does it do?<textarea value={form.summary} onChange={event => update("summary", event.target.value)} placeholder="Short summary for the asset card." /></label><label className="field-label">Detailed explanation<textarea value={form.description} onChange={event => update("description", event.target.value)} placeholder="Explain the tool, its inputs and outputs, and the problem it solves." /></label><label className="field-label">Business value<textarea value={form.businessValue} onChange={event => update("businessValue", event.target.value)} placeholder="What value did this create? What revenue, risk, quality, or operational result did it achieve?" /></label><div className="grid gap-5 sm:grid-cols-2"><label className="field-label">Hours saved<input type="number" min="0" value={form.estimatedHoursSaved} onChange={event => update("estimatedHoursSaved", event.target.value)} placeholder="e.g. 40" /></label><label className="field-label">Cost saved<input type="number" min="0" value={form.estimatedCostSaved} onChange={event => update("estimatedCostSaved", event.target.value)} placeholder="Optional amount" /></label></div><div className="grid gap-5 sm:grid-cols-2"><label className="field-label">Project type<span className="field-hint">{selectedType.hint}</span><select value={form.type} onChange={event => update("type", event.target.value)}>{projectTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="field-label">Technology <span className="field-hint">Optional search signal</span><Input value={form.technology} onChange={event => update("technology", event.target.value)} placeholder="Python, Node.js, Terraform..." /></label></div><div className="grid gap-5 sm:grid-cols-2"><label className="field-label">Version <span className="field-hint">First commit</span><Input required value={form.version} onChange={event => update("version", event.target.value)} placeholder="0.1.0" /></label><label className="field-label">Tags <span className="field-hint">Comma-separated · max 12</span><Input value={form.tags} onChange={event => update("tags", event.target.value)} placeholder="ran, automation, troubleshooting" /></label></div><div className="mt-6 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.03] p-4"><div className="section-kicker">Usage guide</div><p className="mt-1 text-xs text-slate-500">Help your Manager and future users understand how to use the tool.</p><div className="mt-4 grid gap-4"><label className="field-label">Purpose<textarea value={form.purpose} onChange={event => update("purpose", event.target.value)} placeholder="Who should use it and for what purpose?" /></label><label className="field-label">How to use<textarea value={form.usage} onChange={event => update("usage", event.target.value)} placeholder="Step-by-step usage, inputs, outputs, and expected result." /></label><label className="field-label">Installation / setup<textarea value={form.installation} onChange={event => update("installation", event.target.value)} placeholder="Dependencies, installation, configuration, or deployment steps." /></label><label className="field-label">Troubleshooting<textarea value={form.troubleshooting} onChange={event => update("troubleshooting", event.target.value)} placeholder="Common errors and how to resolve them." /></label></div></div></div></section>
        </div>

        <aside className="create-side-column"><section className="repo-card"><div className="section-kicker"><GitBranch size={13} /> Commit destination</div><h2>Where should it live?</h2><p className="section-help">Choose a team by name. The project will be visible to that team after review.</p><label className="field-label mt-6">Target team<span className="field-hint">{teams.isLoading ? "Loading your teams..." : "Only teams in your scope are shown"}</span><select required value={form.homeTeamId} onChange={event => update("homeTeamId", event.target.value)} disabled={teams.isLoading || !teams.data?.length}><option value="" disabled>Select a team</option>{teams.data?.map(team => <option key={team.id} value={team.id}>{team.name} · {team.code}</option>)}</select></label>{teams.data?.[0]?.description && <div className="team-preview"><span className="team-avatar">{teams.data[0].code.slice(0, 1)}</span><div><strong>{teams.data.find(team => team.id === form.homeTeamId)?.name ?? teams.data[0].name}</strong><span>{teams.data.find(team => team.id === form.homeTeamId)?.description ?? teams.data[0].description}</span></div></div>}<label className="field-label mt-5">Visibility<span className="field-hint">{selectedClassification.hint}</span><select value={form.classification} onChange={event => update("classification", event.target.value)}>{classifications.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></section>

          <section className="repo-card database-card"><div className="section-kicker"><Database size={13} /> What ENGHUB stores</div><h2>Clear data boundary</h2><div className="storage-list"><div><span className="storage-icon storage-icon-file"><Archive size={14} /></span><p><strong>Secure storage</strong><span>Original archive plus extracted project files, checksums, paths, sizes, and content types.</span></p></div><div><span className="storage-icon storage-icon-db"><Database size={14} /></span><p><strong>PostgreSQL</strong><span>Name, summary, team, classification, version, tags, owner, and file reference.</span></p></div><div><span className="storage-icon storage-icon-lock"><LockKeyhole size={14} /></span><p><strong>Governance</strong><span>Pending review status, reviewer approval, and an audit event.</span></p></div></div></section>

          <section className="commit-card"><div className="commit-card-top"><div><div className="section-kicker"><ShieldCheck size={13} /> Ready for review</div><h2>{form.name || "Your project"}</h2></div><span className="pending-badge">Pending review</span></div><div className="commit-summary"><span>{uploadedProject ? `${uploadedProject.project.fileCount} files · ${uploadedProject.project.format.toUpperCase()}` : "No project uploaded yet"}</span><span>{form.version || "0.1.0"}</span></div><Button type="submit" disabled={submit.isPending || upload.isPending || isPreparing || !uploadedProject || !form.homeTeamId} className="create-button commit-button">{submit.isPending ? "Creating asset..." : "Commit project & request review"}<ArrowLeft size={15} className="rotate-180" /></Button><p className="commit-note"><CheckCircle2 size={13} /> Manager approval is required before this project is published.</p>{submit.error && <p className="form-error mt-3"><Info size={14} />{submit.error.message}</p>}</section></aside>
      </form>
    </div>
  </div>;
}
