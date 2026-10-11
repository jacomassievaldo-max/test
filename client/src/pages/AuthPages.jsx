import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { errMsg } from '../api';
import { Alert, Field, Logo, useTitle } from '../components/ui';

function Shell({ title, sub, children }) {
  return <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10"><div className="mb-6 text-center"><Logo className="text-2xl" /><h1 className="mt-5 font-display text-2xl font-bold text-white">{title}</h1><p className="text-sm text-slate-400">{sub}</p></div><div className="card p-6">{children}</div></div>;
}

export function Login() {
  useTitle('Sign in');
  const { login } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await login(f.email, f.password); nav(sp.get('next') || '/'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return (
    <Shell title="Welcome back" sub="Sign in to your GameVest account">
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-400">New here? <Link className="text-brand-soft hover:underline" to="/register">Create an account</Link></p>
        <p className="rounded-lg bg-ink-900 p-3 text-xs text-slate-500">Demo accounts (password <code>Gamevest123</code>): player1@gamevest.test · moonlight@gamevest.test (verified dev) · novalantern@gamevest.test (unverified dev) · publisher@gamevest.test · admin@gamevest.test</p>
      </form>
    </Shell>
  );
}

export function Register() {
  useTitle('Create account');
  const { register } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [f, setF] = useState({ name: '', email: '', password: '', role: sp.get('role') || 'PLAYER', studioName: '', company: '', country: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const p = { ...f }; Object.keys(p).forEach((k) => p[k] === '' && delete p[k]); const user = await register(p); nav(user.role === 'DEVELOPER' ? '/developer' : user.role === 'PUBLISHER' ? '/scout' : '/'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Join GameVest" sub="Discover. Play. Back the next big game.">
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">{[['PLAYER', 'Player'], ['DEVELOPER', 'Developer'], ['PUBLISHER', 'Publisher']].map(([v, l]) => <button type="button" role="radio" aria-checked={f.role === v} key={v} onClick={() => setF({ ...f, role: v })} className={`chip justify-center !py-2 ${f.role === v ? 'chip-on' : ''}`}>{l}</button>)}</div>
        <Field label="Your name"><input className="input" required minLength={2} autoComplete="name" value={f.name} onChange={u('name')} /></Field>
        {f.role === 'DEVELOPER' && <Field label="Studio name"><input className="input" required minLength={2} value={f.studioName} onChange={u('studioName')} /></Field>}
        {f.role === 'PUBLISHER' && <Field label="Company"><input className="input" required minLength={2} value={f.company} onChange={u('company')} /></Field>}
        {f.role !== 'PUBLISHER' && <Field label="Country (optional)"><input className="input" value={f.country} onChange={u('country')} /></Field>}
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={u('email')} /></Field>
        <Field label="Password" hint="At least 8 characters, with letters and numbers."><input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={u('password')} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-400">Already registered? <Link className="text-brand-soft hover:underline" to="/login">Sign in</Link></p>
      </form>
    </Shell>
  );
}
