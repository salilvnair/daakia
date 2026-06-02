import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const networkResolvers: VariableResolver[] = [
  {
    name: 'randomUrl',
    description: 'A random HTTPS URL',
    category: 'network',
    example: 'https://a1b2c3d4.example.com',
    resolve: () => `https://${crypto.randomBytes(4).toString('hex')}.example.com`,
  },
  {
    name: 'randomIPv4',
    description: 'A random IPv4 address',
    category: 'network',
    example: '192.168.42.128',
    resolve: () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.'),
  },
  {
    name: 'randomIPv6',
    description: 'A random IPv6 address',
    category: 'network',
    example: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    resolve: () => Array.from({ length: 8 }, () => crypto.randomBytes(2).toString('hex')).join(':'),
  },
  {
    name: 'randomMACAddress',
    description: 'A random MAC address',
    category: 'network',
    example: '3a:2b:1c:4d:5e:6f',
    resolve: () => Array.from({ length: 6 }, () => crypto.randomBytes(1).toString('hex')).join(':'),
  },
  {
    name: 'randomUserAgent',
    description: 'A random browser user-agent string',
    category: 'network',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    resolve: () => pickRandom([
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    ]),
  },
];
