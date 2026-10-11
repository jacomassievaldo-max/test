import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { ensurePolicies } from '../src/lib/policies.js';
import { recomputeAllScores } from '../src/lib/score.js';
import { computeTrending } from '../src/lib/trending.js';
import { computeReputation } from '../src/lib/reputation.js';
import { config } from '../src/config.js';

const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const day = (n) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d; };
const PW = 'Gamevest123';
const hash = await bcrypt.hash(PW, 10);

await ensurePolicies();
const mkUser = (email, name, role, extra = {}) => prisma.user.create({ data: { email, name, role, passwordHash: hash, ...extra } });

const admin = await mkUser('admin@gamevest.test', 'GameVest Admin', 'ADMIN');
const pub = await mkUser('publisher@gamevest.test', 'Paula Publisher', 'PUBLISHER');
await prisma.publisherProfile.create({ data: { userId: pub.id, company: 'Northlight Publishing' } });

const players = [];
for (let i = 1; i <= 40; i++) {
  const u = await mkUser(`player${i}@gamevest.test`, ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fabio', 'Gabi', 'Hugo'][i % 8] + ' ' + String.fromCharCode(64 + (i % 26 || 26)) + '.', 'PLAYER', { createdAt: new Date(Date.now() - rnd(3, 200) * 864e5) });
  await prisma.playerProfile.create({ data: { userId: u.id, displayName: u.name } });
  players.push(u);
}

const studiosData = [
  { name: 'Moonlight Studios', slug: 'moonlight-studios', country: 'Brazil', email: 'moonlight@gamevest.test', verified: true, months: 14, description: 'Indie team from São Paulo crafting atmospheric RPGs.' },
  { name: 'Pixel Forge', slug: 'pixel-forge', country: 'Portugal', email: 'pixelforge@gamevest.test', verified: true, months: 9, description: 'Pixel art, tight controls, big heart.' },
  { name: 'Ironvale Games', slug: 'ironvale-games', country: 'Argentina', email: 'ironvale@gamevest.test', verified: true, months: 20, description: 'Strategy and survival for people who like thinking.' },
  { name: 'Nova Lantern', slug: 'nova-lantern', country: 'Mexico', email: 'novalantern@gamevest.test', verified: false, months: 1, description: 'New team, first project.' },
];
const studios = {};
for (const s of studiosData) {
  const u = await mkUser(s.email, s.name + ' Team', 'DEVELOPER', { createdAt: new Date(Date.now() - s.months * 30 * 864e5) });
  const st = await prisma.studio.create({ data: { name: s.name, slug: s.slug, country: s.country, description: s.description, createdAt: u.createdAt } });
  await prisma.developerProfile.create({ data: { userId: u.id, studioId: st.id } });
  if (s.verified) await prisma.verification.create({ data: { studioId: st.id, status: 'APPROVED', legalName: s.name + ' LTDA', document: '***.***.***-00', payoutInfo: 'via payment provider', evidence: 'Prototype video, repository history and ID reviewed.', reviewedBy: admin.id, reviewedAt: new Date() } });
  studios[s.slug] = { st, u };
}

const G = [
  { t: 'Fallen Kingdom', s: 'moonlight-studios', g: ['RPG', 'Adventure'], stage: 'BETA', p: 78, price: 0, tag: 'A dark-fantasy RPG where every kingdom you save costs you another.', est: 'Q3 2027', demo: true, camp: { goal: 100000_00, raised: 73450_00, backers: 1284, days: 31 }, pop: 1.0, featured: true, ms: ['Prototype:DONE', 'Alpha:DONE', 'Beta:IN_PROGRESS', 'Release:PENDING'] },
  { t: 'Project Oni', s: 'pixel-forge', g: ['Action', 'Pixel Art'], stage: 'ALPHA', p: 55, price: 0, tag: 'Fast-paced pixel-art samurai brawler with parry-driven combat.', est: 'Q1 2027', demo: true, camp: { goal: 60000_00, raised: 41200_00, backers: 702, days: 19 }, pop: 0.8 },
  { t: 'Pixel Frontier', s: 'pixel-forge', g: ['Sandbox', 'Pixel Art', 'Survival'], stage: 'EARLY_ACCESS', p: 70, price: 3490, tag: 'Build a settlement at the edge of a procedurally generated map.', est: '2027', demo: true, pop: 0.7 },
  { t: 'Dark Horizon', s: 'ironvale-games', g: ['Horror', 'Survival'], stage: 'ALPHA', p: 48, price: 0, tag: 'Survive the long night on a derelict orbital station.', est: 'Q4 2027', demo: true, camp: { goal: 80000_00, raised: 22300_00, backers: 310, days: 40 }, pop: 0.65 },
  { t: 'Crown of Ash', s: 'ironvale-games', g: ['Strategy', 'Simulation'], stage: 'RELEASED', p: 100, price: 5990, tag: 'Grand strategy about the slow collapse of a mountain empire.', est: 'Released', demo: false, pop: 0.6, released: true, dlc: [['Frozen Marches', 1990]] },
  { t: 'Rogue Tides', s: 'moonlight-studios', g: ['Roguelike', 'Action'], stage: 'RELEASED', p: 100, price: 3990, tag: 'Sail, loot, die, repeat. A pirate roguelike with persistent crews.', est: 'Released', demo: true, pop: 0.55, released: true },
  { t: 'Starlight Farm', s: 'pixel-forge', g: ['Simulation', 'Pixel Art'], stage: 'PROTOTYPE', p: 25, price: 0, tag: 'A cozy farm sim among the stars.', est: '2028', demo: true, pop: 0.3 },
  { t: 'Echoes of Aether', s: 'moonlight-studios', g: ['MMORPG', 'Multiplayer'], stage: 'CONCEPT', p: 10, price: 0, tag: 'A small-scale MMO built around seasonal worlds.', est: '2028', demo: false, camp: { goal: 150000_00, raised: 9800_00, backers: 140, days: 55 }, pop: 0.25 },
  { t: 'Lantern Keeper', s: 'nova-lantern', g: ['Adventure', 'Horror'], stage: 'PROTOTYPE', p: 30, price: 0, tag: 'Guide lost spirits through a haunted lighthouse.', est: '2027', demo: true, pop: 0.12 },
  { t: 'Hollow Gears', s: 'ironvale-games', g: ['Strategy', 'Multiplayer'], stage: 'BETA', p: 82, price: 0, tag: 'Asymmetric steampunk strategy for two players.', est: 'Q2 2027', demo: true, pop: 0.35 },
];
const colors = {};
let seedN = 1;
for (const d of G) {
  const st = studios[d.s];
  const g = await prisma.game.create({ data: {
    slug: d.t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: d.t, tagline: d.tag, description: `${d.tag}\n\n${d.t} is being built by ${st.st.name}. This is sample content for the GameVest MVP seed.\n\nFeatures:\n• Handcrafted worlds\n• Deep progression systems\n• Community-driven roadmap`,
    genres: d.g, tags: ['indie', d.g[0].toLowerCase()], platforms: d.stage === 'CONCEPT' ? ['Windows'] : ['Web', 'Windows', 'Linux'], stage: d.stage, progress: d.p, status: 'PUBLISHED', priceCents: d.price,
    estimatedRelease: d.est, releaseDate: d.released ? new Date(Date.now() - 90 * 864e5) : null, featured: !!d.featured, protectedBy: !!d.camp && st.st.slug !== 'nova-lantern', coverSeed: seedN++ * 7919,
    ageRating: d.g.includes('Horror') ? '16' : '12', studioId: st.st.id, lastUpdateAt: new Date(Date.now() - rnd(1, 20) * 864e5), createdAt: new Date(Date.now() - rnd(10, 150) * 864e5),
    trailerUrl: d.featured ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : null,
    requirements: { create: [{ tier: 'MIN', os: 'Windows 10', cpu: 'Intel i5-6400', gpu: 'GTX 960', ram: '8 GB', storage: '10 GB' }, { tier: 'REC', os: 'Windows 11', cpu: 'Intel i7-9700', gpu: 'RTX 2060', ram: '16 GB', storage: '10 GB SSD' }] },
    demos: d.demo ? { create: [{ kind: 'WEBGL', url: '/demos/orb-runner.html', version: '0.3' }] } : undefined,
    builds: { create: [{ version: '0.' + rnd(2, 9) + '.' + rnd(0, 9), platform: 'Windows', notes: 'Latest build' }] },
    dlcs: d.dlc ? { create: d.dlc.map(([title, priceCents]) => ({ title, priceCents })) } : undefined,
    updates: { create: [{ title: 'Development update #' + rnd(3, 12), body: 'New combat polish, bug fixes and a rebalance pass based on your demo feedback. Thank you!', createdAt: new Date(Date.now() - rnd(1, 8) * 864e5) }, { title: 'Roadmap revised', body: 'We re-scoped the vertical slice to ship a better first impression.', createdAt: new Date(Date.now() - rnd(15, 40) * 864e5) }] },
  } });
  colors[d.t] = g.id;

  if (d.camp) {
    const c = await prisma.campaign.create({ data: {
      gameId: g.id, title: `Back ${d.t}`, summary: `Help ${st.st.name} finish ${d.t}. Pledges fund development and come with rewards. This is crowdfunding, not an investment: there is no financial return.`,
      goalCents: d.camp.goal, raisedCents: d.camp.raised, backersCount: d.camp.backers, endsAt: new Date(Date.now() + d.camp.days * 864e5), status: 'ACTIVE', adminApproved: true, termsVersion: config.termsVersion,
      rewards: { create: [
        { title: 'SUPPORTER', description: 'Your name on the supporters page.', priceCents: 2000, kind: 'SUPPORT' },
        { title: 'GAME COPY', description: 'A copy of the game on release, per campaign terms.', priceCents: 5000, kind: 'GAME_COPY', limit: 5000 },
        { title: 'FOUNDER PACK', description: 'Game + exclusive cosmetic content.', priceCents: 10000, kind: 'BUNDLE', limit: 2000 },
        { title: 'EARLY ACCESS', description: 'Access to eligible early builds.', priceCents: 25000, kind: 'EARLY_ACCESS', limit: 500 },
        { title: 'FOUNDER', description: 'Special perks + your name in the credits.', priceCents: 50000, kind: 'FOUNDER', limit: 100 },
      ] },
      milestones: { create: (d.ms ?? ['Prototype:DONE', 'Alpha:IN_PROGRESS', 'Beta:PENDING', 'Release:PENDING']).map((m, order) => ({ title: m.split(':')[0], status: m.split(':')[1], order })) },
    } });
  }

  // engagement from seeded players (proportional to popularity)
  const n = Math.round(players.length * d.pop);
  const crowd = [...players].sort(() => Math.random() - 0.5).slice(0, n);
  for (const [i, u] of crowd.entries()) {
    await prisma.wishlist.create({ data: { userId: u.id, gameId: g.id, createdAt: new Date(Date.now() - rnd(0, 20) * 864e5) } });
    if (i % 2 === 0) await prisma.follow.create({ data: { userId: u.id, gameId: g.id, createdAt: new Date(Date.now() - rnd(0, 20) * 864e5) } });
    if (i % 3 === 0) {
      await prisma.review.create({ data: { userId: u.id, gameId: g.id, rating: Math.min(5, Math.max(2, Math.round(3 + d.pop * 1.6 + (Math.random() - 0.4)))), recommended: Math.random() < 0.5 + d.pop * 0.4, verified: true,
        body: ['Really promising — the core loop already feels great.', 'Loved the art direction. Needs a bit more polish on the UI.', 'Played the demo twice. Can\'t wait for the full release!', 'Solid foundation, the developers respond to feedback quickly.'][i % 4] } });
    }
    if (d.demo && i % 2 === 1) {
      const s = await prisma.demoSession.create({ data: { gameId: g.id, userId: u.id, durationSec: rnd(120, 1500), completed: Math.random() < 0.4 + d.pop * 0.3, startedAt: new Date(Date.now() - rnd(0, 20) * 864e5) } });
      await prisma.demoFeedback.create({ data: { sessionId: s.id, gameId: g.id, rating: Math.min(5, Math.max(2, Math.round(3 + d.pop * 1.5 + Math.random() - 0.3))), wouldPlayAgain: Math.random() < 0.6 + d.pop * 0.3, wouldBuy: Math.random() < 0.4 + d.pop * 0.4, priceCents: rnd(20, 90) * 100, improve: Math.random() < 0.5 ? ['More checkpoints please', 'Controller support', 'Tutorial is a bit long', 'Add a difficulty setting'][rnd(0, 3)] : null } });
    }
  }
  if (d.released) {
    for (const u of crowd.slice(0, 6)) {
      const t = await prisma.transaction.create({ data: { userId: u.id, kind: 'PURCHASE', amountCents: d.price, provider: 'mock', providerRef: 'seed_' + g.id + u.id, status: 'PAID', paidAt: new Date(Date.now() - rnd(1, 60) * 864e5) } });
      await prisma.purchase.create({ data: { userId: u.id, gameId: g.id, kind: 'GAME', itemTitle: d.t, amountCents: d.price, transactionId: t.id, termsVersion: config.termsVersion, termsAcceptedAt: t.paidAt, commissionCents: Math.round(d.price * 0.15) } });
      await prisma.library.create({ data: { userId: u.id, gameId: g.id, source: 'PURCHASE' } });
    }
  }
  // 30 days of analytics with growth trend
  for (let i = 29; i >= 0; i--) {
    const k = (1 + (29 - i) / 20) * d.pop;
    const visitors = Math.round(rnd(150, 400) * k), players_ = Math.round(visitors * (0.55 + Math.random() * 0.1)), wl = Math.round(players_ * 0.45);
    await prisma.gameAnalytics.create({ data: { gameId: g.id, date: day(i), visitors, players: d.demo ? players_ : 0, wishlists: wl, follows: Math.round(wl * 0.45), backers: d.camp ? Math.round(wl * 0.2) : 0, purchases: d.price ? Math.round(wl * 0.12) : 0,
      fundingCents: d.camp ? Math.round(wl * 0.2) * 6000 : 0, salesCents: d.price ? Math.round(wl * 0.12) * d.price : 0, avgPlaySec: rnd(300, 700), demoCompletions: Math.round(players_ * 0.4), returningPlayers: Math.round(players_ * 0.25) } });
  }
}

// a pending item for the admin queues
const nova = studios['nova-lantern'];
await prisma.game.create({ data: { slug: 'glass-orchard', title: 'Glass Orchard', tagline: 'Puzzle-adventure in a shattered garden.', description: 'Pending moderation sample project. Submitted by a new studio for review by the GameVest team.', genres: ['Adventure'], platforms: ['Windows'], stage: 'PROTOTYPE', progress: 18, status: 'PENDING', studioId: nova.st.id, coverSeed: 4242 } });
await prisma.verification.create({ data: { studioId: nova.st.id, status: 'PENDING', legalName: 'Nova Lantern S.A.', document: '***-1234', payoutInfo: 'via payment provider', evidence: 'Two-person team, playable prototype, public repository history since January.' } });
const fk = await prisma.game.findUnique({ where: { slug: 'fallen-kingdom' } });
await prisma.report.create({ data: { reporterId: players[0].id, gameId: fk.id, studioId: fk.studioId, reason: 'MISLEADING', details: 'Sample report: trailer shows features not present in the demo.' } });

for (const s of Object.values(studios)) await computeReputation(s.st.id);
await recomputeAllScores();
await computeTrending();
console.log(`Seed done. All accounts use password: ${PW}\n  admin@gamevest.test · publisher@gamevest.test · moonlight@gamevest.test (verified dev) · nova@... novalantern@gamevest.test (unverified dev) · player1@gamevest.test`);
await prisma.$disconnect();
