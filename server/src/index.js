import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { ensurePolicies } from './lib/policies.js';
import { recomputeAllScores } from './lib/score.js';
import { computeTrending } from './lib/trending.js';

await ensurePolicies();
const app = createApp();
app.listen(config.port, () => console.log(`GameVest API on :${config.port}`));

// Periodic jobs (swap for a real queue/cron worker in production)
const hourly = async () => { try { await recomputeAllScores(); await computeTrending(); } catch (e) { console.error('job failed', e); } };
setInterval(hourly, 60 * 60_000).unref();
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
