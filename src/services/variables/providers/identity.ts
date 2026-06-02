import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

export const identityResolvers: VariableResolver[] = [
  {
    name: 'guid',
    description: 'A UUID v4 string',
    category: 'identity',
    example: 'a3b8c9d0-1234-4567-8901-abcdef012345',
    resolve: () => crypto.randomUUID(),
  },
  {
    name: 'randomUUID',
    description: 'Alias for $guid — UUID v4',
    category: 'identity',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    resolve: () => crypto.randomUUID(),
  },
  {
    name: 'randomUuid',
    description: 'Alias for $guid — UUID v4',
    category: 'identity',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    resolve: () => crypto.randomUUID(),
  },
  {
    name: 'randomNanoId',
    description: 'A short random alphanumeric ID (11 chars)',
    category: 'identity',
    example: 'V1StGXR8_Z5',
    resolve: () => crypto.randomBytes(11).toString('base64url').slice(0, 11),
  },
];
