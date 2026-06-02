import type { VariableResolver } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const locationResolvers: VariableResolver[] = [
  {
    name: 'randomCity',
    description: 'A random city name',
    category: 'location',
    example: 'Tokyo',
    resolve: () => pickRandom(['New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto', 'Mumbai', 'Dubai', 'Singapore', 'Seoul', 'San Francisco', 'Amsterdam', 'Bangkok']),
  },
  {
    name: 'randomCountry',
    description: 'A random country name',
    category: 'location',
    example: 'Japan',
    resolve: () => pickRandom(['United States', 'United Kingdom', 'Japan', 'Germany', 'France', 'Canada', 'Australia', 'India', 'Brazil', 'Italy', 'South Korea', 'Netherlands']),
  },
  {
    name: 'randomCountryCode',
    description: 'A random ISO 3166-1 alpha-2 country code',
    category: 'location',
    example: 'JP',
    resolve: () => pickRandom(['US', 'GB', 'JP', 'DE', 'FR', 'CA', 'AU', 'IN', 'BR', 'IT', 'KR', 'NL', 'SG', 'AE']),
  },
  {
    name: 'randomLatitude',
    description: 'A random latitude (-90 to 90)',
    category: 'location',
    example: '35.6762',
    resolve: () => ((Math.random() * 180) - 90).toFixed(4),
  },
  {
    name: 'randomLongitude',
    description: 'A random longitude (-180 to 180)',
    category: 'location',
    example: '139.6503',
    resolve: () => ((Math.random() * 360) - 180).toFixed(4),
  },
  {
    name: 'randomStreetAddress',
    description: 'A random street address',
    category: 'location',
    example: '742 Oak St',
    resolve: () => `${Math.floor(Math.random() * 9999) + 1} ${pickRandom(['Main', 'Oak', 'Elm', 'Park', 'Cedar', 'Pine', 'Maple', 'Broadway', 'Market'])} ${pickRandom(['St', 'Ave', 'Blvd', 'Dr', 'Way'])}`,
  },
];
