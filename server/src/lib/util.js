import { z } from 'zod';

export const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

export const validate = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success) {
    const err = new Error(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    err.status = 400;
    throw err;
  }
  return r.data;
};

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const GENRES = ['Action', 'RPG', 'Strategy', 'Simulation', 'Survival', 'Horror', 'Adventure', 'Multiplayer', 'MMORPG', 'Roguelike', 'Pixel Art', 'Sandbox'];
export const PLATFORMS = ['Web', 'Windows', 'Linux', 'macOS', 'Android', 'iOS'];

export const safeUrl = z.string().url().max(500).refine((u) => /^https:\/\//.test(u), 'must be https');
export const trailerUrl = safeUrl.refine((u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be|player\.vimeo\.com|vimeo\.com)\//.test(u), 'trailer must be a YouTube or Vimeo link');

export const todayDate = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
