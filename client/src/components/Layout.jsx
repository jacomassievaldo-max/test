import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import api from '../api';
import { Logo } from './ui';

const nav = [['Store', '/store'], ['Discover', '/discover'], ['Demos', '/demos'], ['Funding', '/funding'], ['Trending', '/trending'], ['Community', '/community']];
const linkCls = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-ink-700 text-white' : 'text-slate-400 hover:text-white'}`;

function SearchBox({ className = '' }) {
  const nav = useNavigate(); const [q, setQ] = useState('');
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); nav(`/discover?q=${encodeURIComponent(q)}`); }} className={className}>
      <input value={q} onChange={(e) => setQ(e.target.value)} className="input !py-2 !pl-9" placeholder="Search games, studios…" aria-label="Search" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='M11 11l3 3'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: '12px center' }} />
    </form>
  );
}

function Bell() {
  const { user } = useAuth(); const [n, setN] = useState(0);
  useEffect(() => { if (user) api.get('/notifications').then((r) => setN(r.data.unread)).catch(() => {}); }, [user]);
  if (!user) return null;
  return <Link to="/account" className="relative rounded-lg p-2 text-slate-400 hover:text-white" aria-label={`Notifications (${n} unread)`}>🔔{n > 0 && <span className="absolute right-0.5 top-0.5 h-4 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold text-white">{n}</span>}</Link>;
}

function Header() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-600/60 bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link to="/" aria-label="GameVest home"><Logo className="text-lg" /></Link>
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">{nav.map(([l, to]) => <NavLink key={to} to={to} className={linkCls}>{l}</NavLink>)}</nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox className="hidden w-56 md:block xl:w-72" />
          <NavLink to="/wishlist" className={linkCls + ' hidden lg:block'}>Wishlist</NavLink>
          <NavLink to="/library" className={linkCls + ' hidden lg:block'}>Library</NavLink>
          <Bell />
          {user ? <NavLink to="/account" className={linkCls + ' hidden lg:block'}>{user.name.split(' ')[0]}</NavLink> : <Link to="/login" className="btn-ghost !py-2 hidden sm:inline-flex">Sign in</Link>}
          <Link to={user?.role === 'DEVELOPER' ? '/submit' : '/register?role=DEVELOPER'} className="btn-primary !py-2 hidden sm:inline-flex">SUBMIT GAME</Link>
        </div>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-t border-ink-700 px-3 py-1.5 lg:hidden">{nav.map(([l, to]) => <NavLink key={to} to={to} className={linkCls}>{l}</NavLink>)}</div>
    </header>
  );
}

const Icon = ({ d }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const tabs = [['Home', '/', 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'], ['Discover', '/discover', 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3'], ['Play', '/demos', 'M8 5v14l11-7z'], ['Wishlist', '/wishlist', 'M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z'], ['Profile', '/account', 'M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z']];
function BottomNav() {
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600/70 bg-ink-950/95 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid grid-cols-5">
        {tabs.map(([l, to, d]) => (
          <li key={to}><NavLink to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-soft' : 'text-slate-500'}`}><Icon d={d} />{l}</NavLink></li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-600/60 bg-ink-900 pb-24 lg:pb-8">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2"><Logo /><p className="max-w-md text-sm text-slate-400">Discover. Play. Back. Grow. Where the next great games begin.</p>
          <p className="max-w-lg text-xs leading-relaxed text-slate-500">Supporting a game on GameVest is crowdfunding with rewards. It is not an investment and carries no promise of financial return. Games in development may change or never be released. GameVest Score, Verified and Protection badges describe specific checks and processes; they are not guarantees of a project's success.</p></div>
        <div className="text-sm"><div className="mb-2 font-semibold text-white">Platform</div><ul className="space-y-1.5 text-slate-400">{[['Discover', '/discover'], ['Demos', '/demos'], ['Funding', '/funding'], ['Trending', '/trending']].map(([l, t]) => <li key={t}><Link className="hover:text-white" to={t}>{l}</Link></li>)}</ul></div>
        <div className="text-sm"><div className="mb-2 font-semibold text-white">Trust</div><ul className="space-y-1.5 text-slate-400">{[['How GameVest protects you', '/trust'], ['Refund Center', '/refunds'], ['Refund policy', '/trust#refunds'], ['For developers', '/register?role=DEVELOPER'], ['For publishers', '/register?role=PUBLISHER']].map(([l, t]) => <li key={t}><Link className="hover:text-white" to={t}>{l}</Link></li>)}</ul></div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-brand focus:p-2 focus:text-ink-950">Skip to content</a>
      <Header />
      <main id="main" className="mx-auto max-w-7xl pb-24 lg:pb-0"><Outlet /></main>
      <Footer />
      <BottomNav />
    </div>
  );
}
