import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

export const colorResolvers: VariableResolver[] = [
  {
    name: 'randomColor',
    description: 'A random hex color',
    category: 'color',
    example: '#a3f8b1',
    resolve: () => '#' + crypto.randomBytes(3).toString('hex'),
  },
  {
    name: 'randomHexColor',
    description: 'Alias for $randomColor — random hex color',
    category: 'color',
    example: '#a3f8b1',
    resolve: () => '#' + crypto.randomBytes(3).toString('hex'),
  },
  {
    name: 'randomRgbColor',
    description: 'A random RGB color string',
    category: 'color',
    example: 'rgb(163, 248, 177)',
    resolve: () => {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      return `rgb(${r}, ${g}, ${b})`;
    },
  },
];
