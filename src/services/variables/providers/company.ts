import type { VariableResolver } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const companyResolvers: VariableResolver[] = [
  {
    name: 'randomCompanyName',
    description: 'A random company name',
    category: 'company',
    example: 'Acme Corp',
    resolve: () => `${pickRandom(['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Oscorp', 'Cyberdyne', 'Aperture', 'Weyland', 'Nexus', 'Skynet', 'Delos'])} ${pickRandom(['Corp', 'Inc', 'LLC', 'Labs', 'Industries', 'Technologies'])}`,
  },
  {
    name: 'randomDepartment',
    description: 'A random department name',
    category: 'company',
    example: 'Engineering',
    resolve: () => pickRandom(['Engineering', 'Marketing', 'Sales', 'Finance', 'HR', 'Legal', 'Operations', 'Design', 'Product', 'Support', 'Research']),
  },
];
