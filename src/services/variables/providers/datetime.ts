import type { VariableResolver } from '../types';

export const datetimeResolvers: VariableResolver[] = [
  {
    name: 'timestamp',
    description: 'Current Unix timestamp (seconds)',
    category: 'datetime',
    example: '1716700800',
    resolve: () => String(Math.floor(Date.now() / 1000)),
  },
  {
    name: 'isoTimestamp',
    description: 'Current ISO 8601 datetime string',
    category: 'datetime',
    example: '2026-05-26T12:00:00.000Z',
    resolve: () => new Date().toISOString(),
  },
  {
    name: 'now',
    description: 'Alias for $isoTimestamp — current ISO datetime',
    category: 'datetime',
    example: '2026-05-26T12:00:00.000Z',
    resolve: () => new Date().toISOString(),
  },
  {
    name: 'timestampMs',
    description: 'Current Unix timestamp (milliseconds)',
    category: 'datetime',
    example: '1716700800000',
    resolve: () => String(Date.now()),
  },
  {
    name: 'date',
    description: 'Current date in YYYY-MM-DD format',
    category: 'datetime',
    example: '2026-05-26',
    resolve: () => new Date().toISOString().split('T')[0],
  },
  {
    name: 'time',
    description: 'Current time in HH:MM:SS format',
    category: 'datetime',
    example: '14:30:45',
    resolve: () => new Date().toISOString().split('T')[1].split('.')[0],
  },
  {
    name: 'dateTime',
    description: 'Current datetime in human-readable format',
    category: 'datetime',
    example: 'Mon May 26 2026 14:30:45',
    resolve: () => new Date().toString().split(' GMT')[0],
  },
];
