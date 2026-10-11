import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { ago, errMsg, money } from '../api';
import { Alert, Spinner, Stat, useTitle } from '../components/ui';

const TABS = [['overview', 'Overview'], ['games', 'Games'], ['verifications', 'Verifications'], ['campaigns', 'Campaigns'], ['reports', 'Reports'], ['refunds', 'Refunds'], ['disputes', 'Disputes'], ['transactions', 'Transactions'], ['users', 'Users'], ['security-logs', 'Security'], ['audit', 'Audit log'], ['policies', 'Refund policies']];

function Btn({ children, onClick, tone = 'ghost' }) { return <button onClick={onClick} className={`${tone === 'danger' ? 'btn-danger' : tone === 'ok' ? 'btn-mint' : 'btn-ghost'} !px-2.5 !py-1 !text-xs`}>{children}</button>; }

function Table({ cols, rows, empty = 'Nothing here.' }) {
  if (!rows.length) return <p className="card p-6 text-center text-sm text-slate-500">{empty}</p>;
  return <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-ink-600 text-xs uppercase tracking-wide text-slate-500"><tr>{cols.map((c) => <th key={c} className="px-4 py-3 font-medium">{c}</th>)}</tr></thead><tbody className="divide-y divide-ink-700">{rows.map((r, i) => <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className="px-4 py-3 text-slate-300">{c}</td>)}</tr>)}</tbody></table></div>;
}

function PolicyEditor({ p, onSaved }) {
  const [f, setF] = useState({ windowDays: p.windowDays, maxPlaytimeMinutes: p.maxPlaytimeMinutes ?? '', autoApprove: p.autoApprove, refundable: p.refundable, summary: p.summary });
  const save = async () => { try { await api.put(`/admin/refund-policies/${p.scope}`, { ...f, windowDays: Number(f.windowDays), maxPlaytimeMinutes: f.maxPlaytimeMinutes === '' ? null : Number(f.maxPlaytimeMinutes) }); onSaved({ t: 'ok', m: `${p.scope} policy saved` }); } catch (e) { onSaved({ t: 'error', m: errMsg(e) }); } };
  return (
    <div className="card space-y-3 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{p.scope.replaceAll('_', ' ')}</div>
      <div className="grid grid-cols-2 gap-3"><label><span className="label">Window (days)</span><input type="number" min="0" className="input" value={f.windowDays} onChange={(e) => setF({ ...f, windowDays: e.target.value })} /></label><label><span className="label">Max playtime (min)</span><input type="number" min="0" className="input" placeholder="none" value={f.maxPlaytimeMinutes} onChange={(e) => setF({ ...f, maxPlaytimeMinutes: e.target.value })} /></label></div>
      <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" className="accent-[#8b7bff]" checked={f.refundable} onChange={(e) => setF({ ...f, refundable: e.target.checked })} />Refundable</label><label className="flex items-center gap-2"><input type="checkbox" className="accent-[#8b7bff]" checked={f.autoApprove} onChange={(e) => setF({ ...f, autoApprove: e.target.checked })} />Auto-approve when eligible</label></div>
      <label><span className="label">Text shown to users before purchase</span><textarea rows={3} className="input" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
      <button className="btn-primary !py-2" onClick={save}>Save policy</button></div>
  );
}

export default function Admin() {
  useTitle('Admin'); const [tab, setTab] = useState('overview'); const [state, setState] = useState({ tab: null, data: null }); const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { try { const data = (await api.get(tab === 'policies' ? '/policies/refund' : `/admin/${tab === 'overview' ? 'stats' : tab}`)).data; setState({ tab, data }); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); setState({ tab, data: {} }); } }, [tab]);
  useEffect(() => { load(); }, [load]);
  const act = async (path, label) => {
    const note = ['reject', 'suspend', 'cancel', 'deny', 'flag', 'action', 'dismiss', 'approve'].some((w) => path.includes(w)) ? window.prompt(`${label} — add a note (optional)`) : '';
    if (note === null) return;
    try { await api.post(`/admin/${path}`, { note: note || undefined }); setMsg({ t: 'ok', m: `${label}: done` }); load(); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };
  const d = state.tab === tab ? state.data : null; // never render one tab with another tab's data
  const A = (path, label, tone) => <Btn key={path} tone={tone} onClick={() => act(path, label)}>{label}</Btn>;

  const render = () => {
    if (!d) return <Spinner />;
    if (msg?.t === 'error' && !Object.keys(d).length) return null;
    if (tab === 'policies') return <div className="grid gap-4 md:grid-cols-2">{d.policies.map((p) => <PolicyEditor key={p.scope} p={p} onSaved={(m) => { setMsg(m); load(); }} />)}</div>;
    if (tab === 'overview') return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Users', d.users], ['Published games', d.games], ['Pending games', d.pendingGames], ['Active campaigns', d.activeCampaigns], ['Open reports', d.openReports], ['Pending verifications', d.pendingVerifications], ['Refunds to review', d.refundsToReview], ['Open disputes', d.openDisputes], ['Paid transactions', d.paidTransactions], ['Volume', money(d.volumeCents)], ['Est. commission', money(d.commissionCents)]].map(([l, v]) => <Stat key={l} label={l} value={v} />)}</div>
      <button className="btn-primary" onClick={async () => { try { const r = await api.post('/admin/jobs/recompute'); setMsg({ t: 'ok', m: `Scores, reputation and trending recomputed (${r.data.ranked} ranked).` }); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); } }}>Recompute scores & trending</button></div>;
    if (tab === 'games') return <Table cols={['Game', 'Studio', 'Status', 'Flags', 'Actions']} rows={d.games.map((g) => [<Link className="text-white hover:underline" to={`/games/${g.slug}`}>{g.title}</Link>, <>{g.studio.name} {g.studio.verification?.status === 'APPROVED' && <span className="text-mint">✓</span>}</>, g.status, <>{g._count.reports} reports{g.featured && ' · featured'}{g.sponsored && ' · sponsored'}{g.protectedBy && ' · protected'}</>, <div className="flex flex-wrap gap-1">{g.status === 'PENDING' && <>{A(`games/${g.id}/approve`, 'Approve', 'ok')}{A(`games/${g.id}/reject`, 'Reject', 'danger')}</>}{g.status === 'PUBLISHED' && <>{A(`games/${g.id}/suspend`, 'Suspend', 'danger')}{A(`games/${g.id}/${g.featured ? 'unfeature' : 'feature'}`, g.featured ? 'Unfeature' : 'Feature')}{A(`games/${g.id}/${g.protectedBy ? 'unprotect' : 'protect'}`, g.protectedBy ? 'Remove Protection' : 'Grant Protection')}{A(`games/${g.id}/${g.sponsored ? 'unsponsor' : 'sponsor'}`, g.sponsored ? 'Unsponsor' : 'Sponsor')}</>}{g.status === 'SUSPENDED' && A(`games/${g.id}/restore`, 'Restore')}</div>])} />;
    if (tab === 'verifications') return <Table cols={['Studio', 'Legal name', 'Evidence', 'Status', 'Actions']} rows={d.verifications.map((v) => [v.studio.name, v.legalName, <span className="line-clamp-3 max-w-xs">{v.evidence}</span>, v.status, v.status === 'PENDING' ? <div className="flex gap-1">{A(`verifications/${v.id}/approve`, 'Approve', 'ok')}{A(`verifications/${v.id}/reject`, 'Reject', 'danger')}</div> : ago(v.reviewedAt)])} />;
    if (tab === 'campaigns') return <Table cols={['Campaign', 'Studio', 'Progress', 'Status', 'Actions']} rows={d.campaigns.map((c) => [c.title, <>{c.game.studio.name} {c.game.studio.verification?.status === 'APPROVED' ? <span className="text-mint">✓</span> : <span className="text-amber">unverified</span>}</>, `${money(c.raisedCents)} / ${money(c.goalCents)}`, `${c.status}${c.adminApproved ? '' : ' (not approved)'}`, <div className="flex gap-1">{!c.adminApproved && c.status === 'DRAFT' && A(`campaigns/${c.id}/approve`, 'Approve', 'ok')}{c.status === 'ACTIVE' && <>{A(`campaigns/${c.id}/end`, 'End')}{A(`campaigns/${c.id}/cancel`, 'Cancel', 'danger')}</>}</div>])} />;
    if (tab === 'reports') return <Table cols={['Target', 'Reason', 'Details', 'Status', 'Actions']} rows={d.reports.map((r) => [r.game?.title ?? r.studio?.name, r.reason.replaceAll('_', ' '), <span className="line-clamp-3 max-w-xs">{r.details}</span>, r.status, ['OPEN', 'REVIEWING'].includes(r.status) ? <div className="flex gap-1">{r.status === 'OPEN' && A(`reports/${r.id}/review`, 'Review')}{A(`reports/${r.id}/action`, 'Action taken', 'ok')}{A(`reports/${r.id}/dismiss`, 'Dismiss')}</div> : ago(r.createdAt)])} />;
    if (tab === 'refunds') return <Table cols={['User', 'Item', 'Amount', 'Reason', 'Status', 'Actions']} rows={d.refunds.map((r) => [r.user.email, r.purchase?.itemTitle ?? r.backing?.campaign.title, money(r.amountCents, { exact: true }), <>{r.scope.replaceAll('_', ' ')}<br /><span className="text-xs text-slate-500">{r.reason}</span></>, r.status.replaceAll('_', ' '), ['UNDER_REVIEW', 'REQUESTED'].includes(r.status) ? <div className="flex gap-1">{A(`refunds/${r.id}/approve`, 'Approve', 'ok')}{A(`refunds/${r.id}/deny`, 'Deny', 'danger')}</div> : r.decisionNote])} />;
    if (tab === 'disputes') return <Table cols={['User', 'Subject', 'Body', 'Status', 'Actions']} rows={d.disputes.map((x) => [x.user.email, x.subject, <span className="line-clamp-3 max-w-xs">{x.body}</span>, x.status, x.status === 'OPEN' ? <div className="flex gap-1">{A(`disputes/${x.id}/resolve_user`, 'For user')}{A(`disputes/${x.id}/resolve_dev`, 'For developer')}{A(`disputes/${x.id}/close`, 'Close')}</div> : ''])} />;
    if (tab === 'transactions') return <Table cols={['When', 'User', 'Kind', 'Item', 'Amount', 'Status']} rows={d.transactions.map((t) => [ago(t.createdAt), t.user.email, t.kind, t.purchase?.itemTitle ?? t.backing?.campaign.title ?? '', money(t.amountCents, { exact: true }), t.status])} />;
    if (tab === 'users') return <Table cols={['User', 'Role', 'Status', 'Joined', 'Actions']} rows={d.users.map((u) => [<>{u.name}<br /><span className="text-xs text-slate-500">{u.email}</span></>, u.role, <>{u.status}{u.flagged && <span className="text-amber"> · flagged</span>}</>, ago(u.createdAt), u.role === 'ADMIN' ? '' : <div className="flex gap-1">{u.status === 'ACTIVE' ? A(`users/${u.id}/suspend`, 'Suspend', 'danger') : A(`users/${u.id}/reinstate`, 'Reinstate')}{A(`users/${u.id}/${u.flagged ? 'unflag' : 'flag'}`, u.flagged ? 'Unflag' : 'Flag')}</div>])} />;
    if (tab === 'security-logs') return <Table cols={['When', 'Type', 'Severity', 'Detail']} rows={d.logs.map((l) => [ago(l.createdAt), l.type, <span className={l.severity === 'high' ? 'text-danger' : l.severity === 'warn' ? 'text-amber' : ''}>{l.severity}</span>, l.detail])} />;
    if (tab === 'audit') return <Table cols={['When', 'Admin', 'Action', 'Target', 'Note']} rows={d.actions.map((a) => [ago(a.createdAt), a.adminId.slice(-6), a.action, `${a.targetType} ${a.targetId.slice(-6)}`, a.note])} />;
    return null;
  };
  return (
    <div className="space-y-6 px-4 py-8 md:py-10">
      <h1 className="font-display text-3xl font-bold text-white">Admin Dashboard</h1>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-600" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-brand text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>{l}</button>)}</div>
      {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
      {render()}
    </div>
  );
}
