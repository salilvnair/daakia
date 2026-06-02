/**
 * Variable Resolver — Public API.
 *
 * Structure:
 *   variables/
 *   ├── index.ts          ← you are here (public exports)
 *   ├── types.ts          ← VariableResolver interface, VariableCategory
 *   ├── registry.ts       ← register/unregister/resolve functions
 *   └── providers/
 *       ├── index.ts      ← auto-registers all core providers
 *       ├── identity.ts   ← guid, randomUUID, randomNanoId
 *       ├── datetime.ts   ← timestamp, isoTimestamp, now, date, time
 *       ├── number.ts     ← randomInt, randomFloat, randomBoolean
 *       ├── text.ts       ← lorem, password, hexString
 *       ├── person.ts     ← names, email, phone, job
 *       ├── network.ts    ← url, ip, mac, userAgent
 *       ├── color.ts      ← hex, rgb
 *       ├── location.ts   ← city, country, lat/lng, address
 *       └── company.ts    ← companyName, department
 *
 * To add a custom resolver at runtime:
 *   import { registerResolver } from './services/variables';
 *   registerResolver({ name: 'myVar', ... });
 */

// Register all core providers (side-effect import)
import './providers';

// Re-export public API
export {
  resolveAll,
  resolveVariable,
  registerResolver,
  registerResolvers,
  unregisterResolver,
  getResolver,
  getAllResolvers,
  getResolversByCategory,
} from './registry';

export type { VariableResolver, VariableCategory } from './types';
