/**
 * Providers barrel — imports and registers all core variable providers.
 * To add a new provider: create a file in this folder, export an array of
 * VariableResolver[], then import and spread it into `allCoreResolvers` below.
 */
import { registerResolvers } from '../registry';
import { identityResolvers } from './identity';
import { datetimeResolvers } from './datetime';
import { numberResolvers } from './number';
import { textResolvers } from './text';
import { personResolvers } from './person';
import { networkResolvers } from './network';
import { colorResolvers } from './color';
import { locationResolvers } from './location';
import { companyResolvers } from './company';

const allCoreResolvers = [
  ...identityResolvers,
  ...datetimeResolvers,
  ...numberResolvers,
  ...textResolvers,
  ...personResolvers,
  ...networkResolvers,
  ...colorResolvers,
  ...locationResolvers,
  ...companyResolvers,
];

// Auto-register all on import
registerResolvers(allCoreResolvers);

export { allCoreResolvers };
