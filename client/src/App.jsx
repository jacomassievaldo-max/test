import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './auth';
import { Spinner } from './components/ui';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Trending from './pages/Trending';
import GamePage from './pages/GamePage';
import Studio from './pages/Studio';
import { Login, Register } from './pages/AuthPages';
import Account from './pages/Account';
import { Wishlist, Library, Refunds } from './pages/PlayerPages';
import Community from './pages/Community';
import Trust from './pages/Trust';
import Submit from './pages/Submit';
import DeveloperHub from './pages/DeveloperHub';
import ManageGame from './pages/ManageGame';
import Admin from './pages/Admin';
import Scout from './pages/Scout';

function Guard({ roles, children }) {
  const { user } = useAuth(); const loc = useLocation();
  if (user === undefined) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <div className="p-10 text-center text-slate-400">You don't have access to this page.</div>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="discover" element={<Explore mode="discover" />} />
        <Route path="store" element={<Explore mode="store" />} />
        <Route path="demos" element={<Explore mode="demos" />} />
        <Route path="funding" element={<Explore mode="funding" />} />
        <Route path="trending" element={<Trending />} />
        <Route path="community" element={<Community />} />
        <Route path="trust" element={<Trust />} />
        <Route path="games/:slug" element={<GamePage />} />
        <Route path="studios/:slug" element={<Studio />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="account" element={<Guard><Account /></Guard>} />
        <Route path="wishlist" element={<Guard><Wishlist /></Guard>} />
        <Route path="library" element={<Guard><Library /></Guard>} />
        <Route path="refunds" element={<Guard><Refunds /></Guard>} />
        <Route path="submit" element={<Guard roles={['DEVELOPER']}><Submit /></Guard>} />
        <Route path="developer" element={<Guard roles={['DEVELOPER']}><DeveloperHub /></Guard>} />
        <Route path="developer/games/:id" element={<Guard roles={['DEVELOPER', 'ADMIN']}><ManageGame /></Guard>} />
        <Route path="admin" element={<Guard roles={['ADMIN']}><Admin /></Guard>} />
        <Route path="scout" element={<Guard roles={['PUBLISHER', 'ADMIN']}><Scout /></Guard>} />
        <Route path="*" element={<div className="p-16 text-center"><h1 className="text-3xl font-bold text-white">404</h1><p className="mt-2 text-slate-400">This page doesn't exist.</p></div>} />
      </Route>
    </Routes>
  );
}
