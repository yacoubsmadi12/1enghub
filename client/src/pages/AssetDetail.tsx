import { useEffect, useState, type ChangeEvent } from "react";
import { ArrowLeft, Check, CheckCircle2, Download, FileCheck2, FileText, GitBranch, LockKeyhole, Pencil, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...Array.from(bytes.subarray(index, Math.min(index + 0x8000, bytes.length))));
  return btoa(binary);
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMoney(value: number) {
  return value > 0 ? value.toLocaleString() : "Not recorded";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function ProtectedFileLink({ fileId }: { fileId: string }) {
  const openFile = trpc.assets.openFile.useQuery({ fileId }, { enabled: false, retry: false });
  const handleOpen = async () => {
    const result = await openFile.refetch();
    if (result.data?.url) window.open(result.data.url, "_blank", "noopener,noreferrer");
  };
  return <button type="button" onClick={handleOpen} disabled={openFile.isFetching} title={openFile.error?.message} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60"><Download size={13} /> {openFile.isFetching ? "Opening..." : "Open"}</button>;
}

const emptyGuide = { purpose: "", prerequisites: "", installation: "", configuration: "", usage: "", troubleshooting: "" };

type GuideState = typeof emptyGuide;

export default function AssetDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const auth = useAuth();
  const detail = trpc.assets.get.useQuery({ assetId: id }, { enabled: Boolean(id) && Boolean(auth.user), retry: false });
  const updateDetails = trpc.assets.updateDetails.useMutation();
  const upload = trpc.assets.upload.useMutation();
  const registerFile = trpc.assets.registerFile.useMutation();
  const submitFileForReview = trpc.assets.submitFileForReview.useMutation();
  const [deleteError, setDeleteError] = useState("");
  const deleteAsset = trpc.assets.deleteAsset.useMutation({ onSuccess: () => navigate("/"), onError: error => setDeleteError(error.message) });
  const [editing, setEditing] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [description, setDescription] = useState("");
  const [businessValue, setBusinessValue] = useState("");
  const [hoursSaved, setHoursSaved] = useState("0");
  const [costSaved, setCostSaved] = useState("0");
  const [guide, setGuide] = useState<GuideState>(emptyGuide);

  useEffect(() => {
    if (!detail.data) return;
    setDescription(detail.data.asset.description ?? "");
    setBusinessValue(detail.data.asset.businessValue ?? "");
    setHoursSaved(String(detail.data.asset.estimatedHoursSaved ?? 0));
    setCostSaved(String(detail.data.asset.estimatedCostSaved ?? 0));
    setGuide({
      purpose: detail.data.document?.purpose ?? "",
      prerequisites: detail.data.document?.prerequisites ?? "",
      installation: detail.data.document?.installation ?? "",
      configuration: detail.data.document?.configuration ?? "",
      usage: detail.data.document?.usage ?? "",
      troubleshooting: detail.data.document?.troubleshooting ?? "",
    });
  }, [detail.data]);

  if (auth.loading || detail.isLoading) return <div className="min-h-screen bg-[#080f19] p-8 text-sm text-slate-400">Loading governed asset...</div>;
  if (!auth.user) return <div className="min-h-screen bg-[#080f19] p-8 text-sm text-rose-300"><Link href="/" className="text-cyan-300">Return to ENGHUB</Link><p className="mt-6">Internal access is required.</p></div>;
  if (detail.isError || !detail.data) return <div className="min-h-screen bg-[#080f19] p-8 text-sm text-rose-300"><Link href="/" className="text-cyan-300">Return to ENGHUB</Link><p className="mt-6">This asset is unavailable or outside your governed scope.</p><p className="mt-2 text-xs text-slate-500">If this was opened from the dashboard, refresh the page after the latest deployment.</p></div>;

  const { asset, owner, team, versions, files, relations, activity, document } = detail.data;
  const canEdit = auth.user.role === "top_manager" || auth.user.id === asset.ownerId || auth.user.id === asset.managerId;
  const canDelete = auth.user.role === "top_manager" || auth.user.id === asset.ownerId;
  const workflow = ["Submitted", "Manager review", "Approved", "Published", "Reusable"];
  const workflowIndex = asset.status === "published" || asset.status === "active" ? 4 : asset.status === "approved" ? 2 : asset.status === "pending_review" || asset.status === "changes_requested" ? 1 : 0;
  const saveDetails = () => {
    updateDetails.mutate({ assetId: asset.id, description, businessValue, estimatedHoursSaved: Number(hoursSaved) || 0, estimatedCostSaved: Number(costSaved) || 0, document: guide }, { onSuccess: () => { setEditing(false); void detail.refetch(); } });
  };
  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    setFileMessage(""); setFileError("");
    try {
      const buffer = await selected.arrayBuffer();
      const checksumSha256 = await sha256(buffer);
      upload.mutate({ fileName: selected.name, contentType: selected.type || "application/octet-stream", sizeBytes: selected.size, checksumSha256, dataBase64: bytesToBase64(buffer) }, { onSuccess: result => {
        registerFile.mutate({ assetId: asset.id, fileKey: result.file.fileKey, fileUrl: result.file.fileUrl, fileName: result.file.fileName, contentType: result.file.contentType, sizeBytes: result.file.sizeBytes, checksumSha256: result.file.checksumSha256 }, { onSuccess: registered => {
          if (registered.fileId) submitFileForReview.mutate({ assetId: asset.id, fileId: registered.fileId }, { onSuccess: () => { setFileMessage("Attachment added and sent to the assigned Manager for review."); void detail.refetch(); }, onError: error => setFileError(error.message) });
        }, onError: error => setFileError(error.message) });
      }, onError: error => setFileError(error.message) });
    } catch (error) { setFileError(error instanceof Error ? error.message : "The attachment could not be prepared."); }
  };

  return <div className="min-h-screen bg-[#080f19] text-slate-200"><header className="border-b border-white/[0.07] bg-[#0b1421] px-6 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300"><ArrowLeft size={15} /> ENGHUB workspace</Link><div className="flex items-center gap-2">{canEdit && <Button variant="outline" className="border-cyan-300/20 bg-transparent text-cyan-200" onClick={() => setEditing(!editing)}><Pencil size={14} /> {editing ? "Close editor" : "Edit details"}</Button>}{canDelete && <Button variant="outline" className="border-rose-400/20 bg-transparent text-rose-200" disabled={deleteAsset.isPending} onClick={() => { if (window.confirm("Delete this project permanently? All linked records will be removed.")) deleteAsset.mutate({ assetId: asset.id }); }}><Trash2 size={14} /> {deleteAsset.isPending ? "Deleting..." : "Delete project"}</Button>}<Badge className="border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">{statusLabel(asset.status)}</Badge></div></div>{deleteError && <div className="mx-auto mt-3 max-w-6xl rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">Delete failed: {deleteError}</div>}</header><main className="mx-auto max-w-6xl px-6 py-10"><div className="eyebrow">Governed asset · {statusLabel(asset.type)}</div><div className="mt-3 flex flex-wrap items-start justify-between gap-6"><div><h1 className="text-3xl font-semibold tracking-tight text-white">{asset.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{asset.summary || asset.description || "A governed engineering asset with a documented purpose, measurable value, controlled files, and a clear review path."}</p></div><div className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-4 py-3 text-right"><span className="block text-[10px] uppercase tracking-widest text-slate-500">Direct reviewer</span><strong className="mt-1 block text-sm text-emerald-200">{asset.managerId ? "Assigned Manager" : "Top Manager"}</strong></div></div><div className="mt-8 grid gap-4 md:grid-cols-4"><div className="panel-surface p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Owner</span><strong className="mt-2 block text-sm text-white">{owner?.name || owner?.username || "Unknown owner"}</strong><span className="mt-1 block text-[10px] text-slate-500">{owner?.username ? `@${owner.username}` : "Governed account"}</span></div><div className="panel-surface p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Hours saved</span><strong className="mt-2 block text-sm text-emerald-200">{asset.estimatedHoursSaved || 0} h</strong><span className="mt-1 block text-[10px] text-slate-500">Reported operational impact</span></div><div className="panel-surface p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Cost saved</span><strong className="mt-2 block text-sm text-emerald-200">{formatMoney(asset.estimatedCostSaved)}</strong><span className="mt-1 block text-[10px] text-slate-500">Add currency in the description</span></div><div className="panel-surface p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Team</span><strong className="mt-2 block text-sm text-white">{team?.name || "Unknown team"}</strong><span className="mt-1 block text-[10px] text-slate-500">{team?.code || asset.homeTeamId}</span></div></div>{editing && <section className="panel-surface mt-6 border-cyan-300/20 p-6"><div className="section-heading"><div><div className="eyebrow"><Pencil size={13} /> Asset documentation editor</div><h2>Explain the result clearly</h2><p className="mt-2 text-xs text-slate-500">The owner or assigned Manager can update the business value, savings, usage guide, and workflow notes.</p></div><Button className="create-button" disabled={updateDetails.isPending} onClick={saveDetails}><Save size={14} /> {updateDetails.isPending ? "Saving..." : "Save documentation"}</Button></div><div className="mt-6 grid gap-5 md:grid-cols-2"><label className="field-label">Detailed explanation<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What does this tool do, and what are its inputs and outputs?" /></label><label className="field-label">Business value<textarea value={businessValue} onChange={event => setBusinessValue(event.target.value)} placeholder="What did it achieve? Mention revenue, quality, risk, reliability, or customer impact." /></label><label className="field-label">Hours saved<input type="number" min="0" value={hoursSaved} onChange={event => setHoursSaved(event.target.value)} /></label><label className="field-label">Cost saved<input type="number" min="0" value={costSaved} onChange={event => setCostSaved(event.target.value)} /></label></div><div className="mt-5 grid gap-5 md:grid-cols-2"><label className="field-label">Purpose<textarea value={guide.purpose} onChange={event => setGuide(current => ({ ...current, purpose: event.target.value }))} /></label><label className="field-label">How to use<textarea value={guide.usage} onChange={event => setGuide(current => ({ ...current, usage: event.target.value }))} placeholder="Steps, inputs, expected outputs, and result." /></label><label className="field-label">Installation / setup<textarea value={guide.installation} onChange={event => setGuide(current => ({ ...current, installation: event.target.value }))} /></label><label className="field-label">Troubleshooting<textarea value={guide.troubleshooting} onChange={event => setGuide(current => ({ ...current, troubleshooting: event.target.value }))} /></label></div>{updateDetails.error && <p className="mt-4 text-xs text-rose-300">{updateDetails.error.message}</p>}</section>}<section className="panel-surface mt-6 p-6"><div className="section-heading"><div><div className="eyebrow"><GitBranch size={13} /> Work map</div><h2>From submission to reuse</h2></div><ShieldCheck size={17} className="text-cyan-300" /></div><div className="mt-6 grid gap-3 md:grid-cols-5">{workflow.map((step, index) => <div key={step} className={`rounded-xl border p-4 ${index <= workflowIndex ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.07] bg-white/[0.02]"}`}><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index <= workflowIndex ? "bg-cyan-300 text-slate-950" : "bg-white/[0.07] text-slate-500"}`}>{index < workflowIndex ? <Check size={14} /> : index + 1}</span><strong className="text-xs text-white">{step}</strong></div><p className="mt-3 text-[11px] leading-5 text-slate-500">{index === 0 ? "Member submits the project and evidence." : index === 1 ? "Assigned Manager inspects every detail and file." : index === 2 ? "Approval makes the governed asset visible." : index === 3 ? "Release is published to the team library." : "Team members can reuse the documented tool."}</p></div>)}</div></section><div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><section className="panel-surface p-6"><div className="section-heading"><div><div className="eyebrow">Impact & explanation</div><h2>Why this tool matters</h2></div><CheckCircle2 size={17} className="text-emerald-300" /></div><p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-300">{asset.businessValue || "The contributor has not documented the achieved value yet. Use Edit details to describe what the tool improved, what it saved, and who benefits."}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-white/[0.03] p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Technology</span><strong className="mt-2 block text-sm text-white">{asset.technology || "Not recorded"}</strong></div><div className="rounded-lg bg-white/[0.03] p-4"><span className="text-[10px] uppercase tracking-widest text-slate-500">Classification</span><strong className="mt-2 block text-sm text-white">{statusLabel(asset.classification)}</strong></div></div></section><section className="panel-surface p-6"><div className="section-heading"><div><div className="eyebrow">Usage guide</div><h2>How to use this asset</h2></div><FileText size={17} className="text-cyan-300" /></div>{document ? <div className="mt-5 space-y-4">{([ ["Purpose", document.purpose], ["Prerequisites", document.prerequisites], ["Installation", document.installation], ["Configuration", document.configuration], ["Usage", document.usage], ["Troubleshooting", document.troubleshooting] ] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><strong className="text-xs text-cyan-200">{label}</strong><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{value}</p></div>)}</div> : <p className="mt-5 text-sm leading-6 text-slate-500">No usage guide has been documented yet. The owner or Manager can add purpose, installation, configuration, usage, and troubleshooting notes.</p>}</section></div><div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><section className="panel-surface p-6"><div className="section-heading"><div><div className="eyebrow">Repository files</div><h2>Files and attachments</h2></div><div className="flex items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100"><input type="file" className="hidden" onChange={handleAttachment} disabled={upload.isPending || registerFile.isPending} /><Download size={13} /> {upload.isPending || registerFile.isPending ? "Uploading..." : "Attach file"}</label><LockKeyhole size={17} className="text-amber-300" /></div></div>{fileMessage && <p className="mt-3 text-xs text-emerald-300">{fileMessage}</p>}{fileError && <p className="mt-3 text-xs text-rose-300">{fileError}</p>}<div className="mt-5 space-y-3">{files.length ? files.map(file => <div key={file.id} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"><FileText size={16} className="text-slate-500" /><div className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-200">{file.relativePath || file.fileName}</strong><span className="text-[10px] text-slate-500">{file.fileRole === "archive" ? "Original archive" : "Project file"} · {statusLabel(file.reviewStatus)} · {formatBytes(file.sizeBytes)} · {file.contentType}</span></div><ProtectedFileLink fileId={file.id} /></div>) : <p className="text-sm text-slate-500">No files registered.</p>}</div><div className="mt-5 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" /> The assigned Manager, asset owner, team members after approval, and Top Manager can open governed files within their permitted scope.</div></section><section className="panel-surface p-6"><div className="section-heading"><div><div className="eyebrow">Traceability</div><h2>Release history & activity</h2></div><FileCheck2 size={17} className="text-cyan-300" /></div><div className="mt-5 space-y-3">{versions.slice(0, 4).map(version => <div key={version.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3"><FileCheck2 size={15} className="text-cyan-300" /><div className="min-w-0 flex-1"><strong className="block text-sm text-slate-200">{version.version}</strong><span className="text-xs text-slate-500">{version.releaseNotes || "Governed release"}</span></div><span className="text-[10px] text-slate-500">{version.releasedAt ? "Released" : "Draft"}</span></div>)}{activity.slice(0, 4).map(event => <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 text-xs text-slate-400"><strong className="text-slate-200">{statusLabel(event.action)}</strong><span className="ml-2 text-slate-600">{new Date(event.createdAt).toLocaleString()}</span></div>)}</div></section></div>{relations.length > 0 && <section className="panel-surface mt-6 p-6"><div className="eyebrow">Related assets</div><h2 className="mt-2 text-lg font-semibold text-white">Connected work</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{relations.slice(0, 6).map(relation => <div key={relation.id} className="rounded-lg bg-white/[0.03] p-3 text-xs text-slate-300">{relation.relationType} · {relation.sourceAssetId === asset.id ? relation.targetAssetId : relation.sourceAssetId}</div>)}</div></section>}</main></div>;
}
