/**
 * GraphQL Schema - Introspection Response builder.
 * Parses a simplified SDL and returns a valid __schema introspection response.
 * Enables Daakia's GraphQL client to show Schema + Documentation panels from mock servers.
 */

// ---------- Default Sample Schema - ----------

export const DEFAULT_GRAPHQL_SCHEMA = `
type Query {
  countries: [Country!]!
  country(code: ID!): Country
  continents: [Continent!]!
  continent(code: ID!): Continent
  languages: [Language!]!
  language(code: ID!): Language
}

type Country {
  code: ID!
  name: String!
  native: String!
  phone: String!
  capital: String
  currency: String
  emoji: String!
  emojiU: String!
  continent: Continent!
  languages: [Language!]!
  states: [State!]!
}

type Continent {
  code: ID!
  name: String!
  countries: [Country!]!
}

type Language {
  code: ID!
  name: String!
  native: String!
  rtl: Boolean!
}

type State {
  code: String
  name: String!
  country: Country!
}

input StringQueryOperatorInput {
  eq: String
  ne: String
  in: [String]
  nin: [String]
  regex: String
  glob: String
}

input CountryFilterInput {
  code: StringQueryOperatorInput
  currency: StringQueryOperatorInput
  continent: StringQueryOperatorInput
}
`.trim();

// - SDL Parser (simplified) -

interface ParsedField {
  name: string;
  type: string;
  args: Array<{ name: string; type: string; defaultValue?: string }>;
  description?: string;
}

interface ParsedType {
  kind: 'OBJECT' | 'INPUT_OBJECT' | 'ENUM' | 'SCALAR' | 'INTERFACE' | 'UNION';
  name: string;
  fields: ParsedField[];
  enumValues?: string[];
  interfaces?: string[];
  possibleTypes?: string[];
  description?: string;
}

function parseSDL(sdl: string): ParsedType[] {
  const types: ParsedType[] = [];
  if (!sdl.trim()) return types;

  // Match type/input/enum/interface/union blocks
  const blockRegex = /(?:"""[^]*?"""\s*)?(type|input|enum|interface|union)\s+(\w+)(?:\s+implements\s+([^{]+))?\s*(?:=\s*([^}\n]+)|\{([^}]*)\})/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(sdl)) !== null) {
    const [, kindStr, name, implementsStr, unionTypes, bodyStr] = match;

    if (kindStr === 'union') {
      types.push({
        kind: 'UNION',
        name,
        fields: [],
        possibleTypes: (unionTypes || '').split('|').map(t => t.trim()).filter(Boolean),
      });
      continue;
    }

    if (kindStr === 'enum') {
      const values = (bodyStr || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      types.push({ kind: 'ENUM', name, fields: [], enumValues: values });
      continue;
    }

    const kind = kindStr === 'input' ? 'INPUT_OBJECT' : kindStr === 'interface' ? 'INTERFACE' : 'OBJECT';
    const interfaces = implementsStr ? implementsStr.split('&').map(s => s.trim()).filter(Boolean) : undefined;
    const fields = parseFields(bodyStr || '');

    types.push({ kind, name, fields, interfaces });
  }

  return types;
}

function parseFields(body: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  for (const line of lines) {
    // Match: fieldName(arg1: Type, arg2: Type): ReturnType
    const fieldMatch = line.match(/^(\w+)(?:\(([^)]*)\))?\s*:\s*(.+?)$/);
    if (fieldMatch) {
      const [, name, argsStr, type] = fieldMatch;
      const args: ParsedField['args'] = [];

      if (argsStr) {
        const argParts = argsStr.split(',');
        for (const part of argParts) {
          const argMatch = part.trim().match(/^(\w+)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/);
          if (argMatch) {
            args.push({ name: argMatch[1], type: argMatch[2].trim(), defaultValue: argMatch[3]?.trim() });
          }
        }
      }

      fields.push({ name, type: type.trim(), args });
    }
  }

  return fields;
}

// ---------- Introspection Response Builder - ----------

export function buildIntrospectionResponse(sdl: string): { data: { __schema: any } } {
  const schema = sdl.trim() || DEFAULT_GRAPHQL_SCHEMA;
  const parsedTypes = parseSDL(schema);

  // Built-in scalars
  const builtinScalars = ['String', 'Int', 'Float', 'Boolean', 'ID'];

  // Collect all type names referenced
  const allTypeNames = new Set<string>();
  parsedTypes.forEach(t => allTypeNames.add(t.name));
  builtinScalars.forEach(s => allTypeNames.add(s));

  // Find query/mutation/subscription root types
  const queryType = parsedTypes.find(t => t.name === 'Query');
  const mutationType = parsedTypes.find(t => t.name === 'Mutation');
  const subscriptionType = parsedTypes.find(t => t.name === 'Subscription');

  // Build introspection types
  const introspectionTypes: any[] = [];

  // Add built-in scalars
  for (const scalar of builtinScalars) {
    introspectionTypes.push({
      kind: 'SCALAR',
      name: scalar,
      description: null,
      fields: null,
      inputFields: null,
      interfaces: null,
      enumValues: null,
      possibleTypes: null,
    });
  }

  // Add parsed types
  for (const parsedType of parsedTypes) {
    introspectionTypes.push(buildTypeIntrospection(parsedType));
  }

  return {
    data: {
      __schema: {
        queryType: queryType ? { name: 'Query' } : null,
        mutationType: mutationType ? { name: 'Mutation' } : null,
        subscriptionType: subscriptionType ? { name: 'Subscription' } : null,
        types: introspectionTypes,
        directives: [
          { name: 'skip', description: 'Directs the executor to skip this field or fragment when the `if` argument is true.', locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], args: [{ name: 'if', description: 'Skipped when true.', type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'Boolean', ofType: null } }, defaultValue: null }] },
          { name: 'include', description: 'Directs the executor to include this field or fragment only when the `if` argument is true.', locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], args: [{ name: 'if', description: 'Included when true.', type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'Boolean', ofType: null } }, defaultValue: null }] },
          { name: 'deprecated', description: 'Marks an element of a GraphQL schema as no longer supported.', locations: ['FIELD_DEFINITION', 'ENUM_VALUE'], args: [{ name: 'reason', description: 'Explains why this element was deprecated.', type: { kind: 'SCALAR', name: 'String', ofType: null }, defaultValue: '"No longer supported"' }] },
        ],
      },
    },
  };
}

function buildTypeIntrospection(parsed: ParsedType): any {
  const base: any = {
    kind: parsed.kind,
    name: parsed.name,
    description: parsed.description || null,
    fields: null,
    inputFields: null,
    interfaces: null,
    enumValues: null,
    possibleTypes: null,
  };

  if (parsed.kind === 'OBJECT' || parsed.kind === 'INTERFACE') {
    base.fields = parsed.fields.map(f => ({
      name: f.name,
      description: null,
      args: f.args.map(a => ({
        name: a.name,
        description: null,
        type: parseTypeRef(a.type),
        defaultValue: a.defaultValue || null,
      })),
      type: parseTypeRef(f.type),
      isDeprecated: false,
      deprecationReason: null,
    }));
    base.interfaces = (parsed.interfaces || []).map(name => ({ kind: 'INTERFACE', name, ofType: null }));
  }

  if (parsed.kind === 'INPUT_OBJECT') {
    base.inputFields = parsed.fields.map(f => ({
      name: f.name,
      description: null,
      type: parseTypeRef(f.type),
      defaultValue: null,
    }));
  }

  if (parsed.kind === 'ENUM') {
    base.enumValues = (parsed.enumValues || []).map(v => ({
      name: v,
      description: null,
      isDeprecated: false,
      deprecationReason: null,
    }));
  }

  if (parsed.kind === 'UNION') {
    base.possibleTypes = (parsed.possibleTypes || []).map(name => ({ kind: 'OBJECT', name, ofType: null }));
  }

  return base;
}

/** Parse a type string like "[Country!]!" into a nested type reference */
function parseTypeRef(typeStr: string): any {
  const str = typeStr.trim();

  // Non-null: ends with !
  if (str.endsWith('!')) {
    return {
      kind: 'NON_NULL',
      name: null,
      ofType: parseTypeRef(str.slice(0, -1)),
    };
  }

  // List: wrapped in []
  if (str.startsWith('[') && str.endsWith(']')) {
    return {
      kind: 'LIST',
      name: null,
      ofType: parseTypeRef(str.slice(1, -1)),
    };
  }

  // Named type (scalar, object, enum, etc.)
  return {
    kind: 'SCALAR', // Will be corrected by client introspection, but name is what matters
    name: str,
    ofType: null,
  };
}
