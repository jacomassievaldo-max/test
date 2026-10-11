// Payment provider abstraction. GameVest never touches raw card data: a real provider
// (Stripe, Mercado Pago, Pagar.me...) hosts the card form and calls our signed webhook.
// The "mock" provider simulates that flow for development.
import crypto from 'node:crypto';
import { config } from '../config.js';

export function signPayload(raw) {
  return crypto.createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
}
export function verifySignature(raw, sig) {
  if (!sig) return false;
  const exp = Buffer.from(signPayload(raw));
  const got = Buffer.from(String(sig));
  return exp.length === got.length && crypto.timingSafeEqual(exp, got);
}

export const providers = {
  mock: {
    name: 'mock',
    async createCheckout(tx) {
      return { providerRef: `mock_${crypto.randomBytes(8).toString('hex')}`, checkoutUrl: null, requiresConfirm: true };
    },
  },
  // stripe: { createCheckout: ... } -> returns hosted checkout URL; webhook finalises the order
};
export const provider = () => providers[config.paymentsProvider] ?? providers.mock;
