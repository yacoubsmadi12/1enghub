import BrandMark from "@/components/BrandMark";
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function ForgotPassword() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const request = trpc.auth.requestPasswordReset.useMutation({ onSuccess: result => { setMessage(result.message); setError(""); }, onError: e => setError(e.message) });
  const reset = trpc.auth.resetPassword.useMutation({ onSuccess: () => { setMessage("Password changed successfully. You can sign in now."); setError(""); }, onError: e => setError(e.message) });
  return <div className="login-screen reset-screen"><div className="reset-particles" aria-hidden="true"><span /><span /><span /><span /><span /></div><div className="login-card login-card-polished reset-card"><div className="login-card-header"><div className="login-brand-lockup"><BrandMark /><div><strong>ENGHUB</strong><span>Secure recovery</span></div></div><span className="login-secure-badge"><ShieldCheck size={12} /> Protected</span></div><div className="login-divider" /><div className="reset-icon"><Sparkles size={22} /></div><div className="eyebrow mt-5"><KeyRound size={13} /> Account recovery</div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{token ? "Choose a new password" : "Forgot your password?"}<span className="text-cyan-300">.</span></h1><p className="mt-3 text-sm leading-6 text-slate-400">{token ? "Your secure reset link is ready. Set a strong password to return to the workspace." : "Enter your ENGHUB username or company email and we will send a secure reset link."}</p>{!token ? <form className="login-form" onSubmit={event => { event.preventDefault(); request.mutate({ identifier }); }}><label className="login-field"><span>Username or email</span><div className="login-input-wrap"><Mail size={15} /><input required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="engineer.smith or name@company.com" /></div></label><Button type="submit" disabled={request.isPending || identifier.length < 3} className="create-button login-submit">{request.isPending ? "Sending secure link..." : "Send reset link"}</Button></form> : <form className="login-form" onSubmit={event => { event.preventDefault(); reset.mutate({ token, newPassword: password }); }}><label className="login-field"><span>New password</span><div className="login-input-wrap"><KeyRound size={15} /><input required minLength={8} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></div></label><Button type="submit" disabled={reset.isPending || password.length < 8} className="create-button login-submit">{reset.isPending ? "Updating password..." : "Set new password"}</Button></form>}{message && <p className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-200">{message}</p>}{error && <p className="login-error">{error}</p>}<Link href="/" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-100"><ArrowLeft size={14} /> Back to sign in</Link></div></div>;
}
