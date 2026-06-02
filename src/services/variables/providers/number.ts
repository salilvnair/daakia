import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

export const numberResolvers: VariableResolver[] = [
  {
    name: 'randomInt',
    description: 'Random integer between 0 and 1000',
    category: 'number',
    example: '742',
    resolve: () => String(Math.floor(Math.random() * 1000)),
  },
  {
    name: 'randomFloat',
    description: 'Random float between 0 and 1 (4 decimals)',
    category: 'number',
    example: '0.7291',
    resolve: () => (Math.random()).toFixed(4),
  },
  {
    name: 'randomBoolean',
    description: 'Random true/false',
    category: 'number',
    example: 'true',
    resolve: () => String(Math.random() > 0.5),
  },
  {
    name: 'randomAlphaNumeric',
    description: 'A single random alphanumeric character',
    category: 'number',
    example: 'f',
    resolve: () => crypto.randomBytes(1).toString('hex')[0],
  },
];
