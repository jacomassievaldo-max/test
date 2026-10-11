import { useEffect, useState } from 'react';
import api from '../api';
import { Logo, VerifiedBadge, ProtectedBadge, useTitle } from '../components/ui';

const Block = ({ icon, title, children, badge }) => <section className="card space-y-3 p-6"><div className="flex items-center gap-3"><span className="text-2xl">{icon}</span><h2 className="font-display text-xl font-semibold text-white">{title}</h2>{badge}</div><div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div></section>;

export default function Trust() {
  useTitle('Trust & Safety');
  const [pol, setPol] = useState([]);
  useEffect(() => { api.get('/policies/refund').then((r) => setPol(r.data.policies)); }, []);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div><h1 className="font-display text-3xl font-bold text-white md:text-4xl">Built on trust</h1><p className="mt-2 text-slate-400">Players ↔ <Logo className="inline-flex align-middle text-base" /> ↔ Developers. Here is exactly what each badge and protection means — and what it doesn't.</p></div>
      <Block icon="🛡️" title="GameVest Protection" badge={<ProtectedBadge small />}>
        <p>Every purchase and pledge is recorded: who, which project, which reward or product, amount, payment, date, the terms version you accepted, delivery status, refunds and disputes. Eligible projects show the “Protected by GameVest” badge, meaning those transactions go through our refund and dispute process.</p>
        <p className="text-slate-400">It does <b>not</b> guarantee a game will be finished, or that it will be successful, and pledges never carry a financial return.</p></Block>
      <Block icon="✓" title="GameVest Verified" badge={<VerifiedBadge small />}>
        <p>To earn the badge a studio submits identity and studio details, payout information, development evidence, a prototype/demo and a roadmap. Our team reviews it and may request more information for fraud prevention.</p>
        <p className="text-slate-400">The badge means certain checks were performed. It is not a guarantee of completion or success.</p></Block>
      <Block icon="◎" title="GameVest Score">
        <p>A 0–100 indicator built from real signals: demo play and completion, retention, wishlist and followers, reviews, growth, funding and development progress. We cap each signal so volume alone can't inflate it, and ignore flagged accounts.</p>
        <p className="text-slate-400">It's a measure of engagement, never a promise of commercial success or financial return.</p></Block>
      <Block icon="⏳" title="GameVest Guarantee — coming later">
        <p>We're reserving this name for an extra layer covering eligible transactions (e.g. duplicate charges, unauthorized payments, purchased products not delivered, failures covered by policy). We will only use the word “guaranteed” once we have the operational, financial, contractual and legal structure to honor it, and it will protect specific transactions — never profitability.</p></Block>
      <Block icon="◆" title="Milestones">
        <p>Campaigns can show milestones (Prototype → Alpha → Beta → Release) so you can follow real progress. Funds are currently paid out per campaign terms; milestone-linked release and escrow will only be offered when a licensed payment institution provides it.</p></Block>
      <section id="refunds" className="card space-y-4 p-6"><h2 className="font-display text-xl font-semibold text-white">↩ Refund policy by purchase type</h2>
        <p className="text-sm text-slate-400">Shown to you before every purchase. Your statutory consumer rights always apply on top of these rules.</p>
        <div className="grid gap-3 md:grid-cols-2">{pol.map((p) => <div key={p.scope} className="rounded-xl border border-ink-600 bg-ink-900 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{p.scope.replaceAll('_', ' ')}</div><p className="mt-1 text-sm text-slate-300">{p.summary}</p></div>)}</div></section>
      <Block icon="⚠️" title="Risks of backing games in development">
        <p>Games under development may change, be delayed or never be completed. Supporting a campaign is not an investment, does not give you equity, revenue share or any right to profit. Only back what you are comfortable supporting.</p></Block>
    </div>
  );
}
