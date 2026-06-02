import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const textResolvers: VariableResolver[] = [
  {
    name: 'randomLoremWord',
    description: 'A random lorem ipsum word',
    category: 'text',
    example: 'consectetur',
    resolve: () => pickRandom(['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'veniam']),
  },
  {
    name: 'randomLoremSentence',
    description: 'A random lorem ipsum sentence',
    category: 'text',
    example: 'Lorem ipsum dolor sit amet consectetur adipiscing elit.',
    resolve: () => 'Lorem ipsum dolor sit amet consectetur adipiscing elit.',
  },
  {
    name: 'randomLoremParagraph',
    description: 'A random lorem ipsum paragraph',
    category: 'text',
    example: 'Lorem ipsum dolor sit amet...',
    resolve: () => 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
  },
  {
    name: 'randomPassword',
    description: 'A random secure password (16 chars)',
    category: 'text',
    example: 'aB3dE7fG9hJ2kL4m',
    resolve: () => crypto.randomBytes(12).toString('base64url'),
  },
  {
    name: 'randomHexString',
    description: 'A random 16-character hex string',
    category: 'text',
    example: 'a1b2c3d4e5f67890',
    resolve: () => crypto.randomBytes(8).toString('hex'),
  },
];
