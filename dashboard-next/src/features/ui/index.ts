/**
 * The design system's public surface (04-02). Application code imports from '@/features/ui' only.
 * tokens.ts reads the resolved --dir-* custom properties of src/styles/tokens.css for the consumers
 * that cannot use var() (map paint, canvas, chart scales). Primitives are added here by later plans.
 * Nothing under src/features may import '@/components' (the feature fence).
 */
export { JS_TOKEN_KEYS, TokenError, findSurfaceRoot, readTokens, useTokens } from './tokens';
export type { TokenKey, Tokens } from './tokens';
