import * as crypto from 'crypto';
import type { VariableResolver } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const personResolvers: VariableResolver[] = [
  {
    name: 'randomFirstName',
    description: 'A random first name',
    category: 'person',
    example: 'Alice',
    resolve: () => pickRandom(['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack', 'Kara', 'Leo', 'Mia']),
  },
  {
    name: 'randomLastName',
    description: 'A random last name',
    category: 'person',
    example: 'Smith',
    resolve: () => pickRandom(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'White', 'Harris']),
  },
  {
    name: 'randomFullName',
    description: 'A random first + last name',
    category: 'person',
    example: 'Alice Smith',
    resolve: () => `${pickRandom(['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'])} ${pickRandom(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller'])}`,
  },
  {
    name: 'randomEmail',
    description: 'A random email address',
    category: 'person',
    example: 'user4829@example.com',
    resolve: () => `user${Math.floor(Math.random() * 9999)}@example.com`,
  },
  {
    name: 'randomUserName',
    description: 'A random username',
    category: 'person',
    example: 'user_a3f8b1c9',
    resolve: () => `user_${crypto.randomBytes(4).toString('hex')}`,
  },
  {
    name: 'randomUsername',
    description: 'Alias for $randomUserName',
    category: 'person',
    example: 'user_a3f8b1c9',
    resolve: () => `user_${crypto.randomBytes(4).toString('hex')}`,
  },
  {
    name: 'randomPhoneNumber',
    description: 'A random US phone number',
    category: 'person',
    example: '+12125551234',
    resolve: () => `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`,
  },
  {
    name: 'randomJobTitle',
    description: 'A random job title',
    category: 'person',
    example: 'Engineer',
    resolve: () => pickRandom(['Engineer', 'Designer', 'Manager', 'Director', 'Analyst', 'Developer', 'Consultant', 'Architect', 'Lead', 'VP', 'CTO', 'Product Manager']),
  },
];
