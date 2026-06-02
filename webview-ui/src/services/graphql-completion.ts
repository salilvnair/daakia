/**
 * GraphQL auto-completion provider for Monaco Editor.
 * Uses introspected schema to suggest fields, arguments, types, and directives.
 */

// ────────── Schema Types ──────────

interface GqlType {
  name: string | null;
  kind: string;
  ofType?: GqlType | null;
}

interface GqlArg {
  name: string;
  type: GqlType;
  description?: string;
  defaultValue?: string | null;
}

interface GqlField {
  name: string;
  type: GqlType;
  args?: GqlArg[];
  description?: string;
}

interface GqlEnumValue {
  name: string;
  description?: string;
}

interface GqlSchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: GqlField[];
  inputFields?: GqlField[];
  enumValues?: GqlEnumValue[];
  interfaces?: GqlType[];
  possibleTypes?: GqlType[];
}

interface GqlSchema {
  queryType?: { name: string } | null;
  mutationType?: { name: string } | null;
  subscriptionType?: { name: string } | null;
  types?: GqlSchemaType[];
}

// ────────── State ──────────

/** Schema storage keyed by tabId */
const schemasByTab = new Map<string, GqlSchema>();
let activeTabId: string | null = null;
let providerRegistered = false;

// ────────── Public API ──────────

/** Set schema for a specific tab */
export function setGraphQLSchema(tabId: string, schemaJson: string | null): void {
  if (!schemaJson) {
    schemasByTab.delete(tabId);
    return;
  }
  try {
    const parsed = JSON.parse(schemaJson) as GqlSchema;
    schemasByTab.set(tabId, parsed);
  } catch {
    schemasByTab.delete(tabId);
  }
}

/** Set the currently active tab for completions */
export function setActiveGraphQLTab(tabId: string): void {
  activeTabId = tabId;
}

/** Remove schema when tab is closed */
export function removeGraphQLSchema(tabId: string): void {
  schemasByTab.delete(tabId);
}

/** Register the completion provider once globally */
export function initGraphQLCompletionProvider(monacoInstance: any): void {
  if (providerRegistered) return;
  providerRegistered = true;

  monacoInstance.languages.registerCompletionItemProvider('graphql', {
    triggerCharacters: ['{', '(', ' ', ':', '@', '\n', '.'],
    provideCompletionItems: (model: any, position: any) => {
      const schema = activeTabId ? schemasByTab.get(activeTabId) : null;
      if (!schema || !schema.types) return { suggestions: [] };

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      const CIK = monacoInstance.languages.CompletionItemKind;
      const typesMap = buildTypesMap(schema.types);
      const context = getCompletionContext(textUntilPosition, schema, typesMap);

      const suggestions: any[] = [];

      switch (context.kind) {
        case 'top-level':
          // Suggest operation keywords
          suggestions.push(
            { label: 'query', kind: CIK.Keyword, insertText: 'query ${1:OperationName} {\n  $0\n}', insertTextRules: 4, detail: 'Query operation', range, sortText: '0_query' },
            { label: 'mutation', kind: CIK.Keyword, insertText: 'mutation ${1:OperationName} {\n  $0\n}', insertTextRules: 4, detail: 'Mutation operation', range, sortText: '0_mutation' },
            { label: 'subscription', kind: CIK.Keyword, insertText: 'subscription ${1:OperationName} {\n  $0\n}', insertTextRules: 4, detail: 'Subscription operation', range, sortText: '0_subscription' },
            { label: 'fragment', kind: CIK.Keyword, insertText: 'fragment ${1:FragmentName} on ${2:TypeName} {\n  $0\n}', insertTextRules: 4, detail: 'Fragment definition', range, sortText: '0_fragment' },
          );
          // Also suggest shorthand query fields
          if (schema.queryType?.name) {
            const queryType = typesMap.get(schema.queryType.name);
            if (queryType?.fields) {
              suggestions.push({ label: '{', kind: CIK.Snippet, insertText: '{\n  $0\n}', insertTextRules: 4, detail: 'Shorthand query', range, sortText: '0_shorthand' });
            }
          }
          break;

        case 'fields': {
          const parentType = context.typeName ? typesMap.get(context.typeName) : null;
          if (parentType?.fields) {
            for (const field of parentType.fields) {
              const typeStr = resolveTypeName(field.type);
              const hasArgs = field.args && field.args.length > 0;
              const baseType = getBaseTypeName(field.type);
              const returnType = baseType ? typesMap.get(baseType) : null;
              const isObjectLike = returnType && (returnType.kind === 'OBJECT' || returnType.kind === 'INTERFACE' || returnType.kind === 'UNION');

              let insertText = field.name;
              if (hasArgs && isObjectLike) {
                insertText = `${field.name}($1) {\n  $0\n}`;
              } else if (hasArgs) {
                insertText = `${field.name}($1)`;
              } else if (isObjectLike) {
                insertText = `${field.name} {\n  $0\n}`;
              }

              suggestions.push({
                label: field.name,
                kind: CIK.Field,
                insertText,
                insertTextRules: hasArgs || isObjectLike ? 4 : 0,
                detail: typeStr,
                documentation: field.description || undefined,
                range,
                sortText: `1_${field.name}`,
              });
            }
          }
          // __typename is always available on object types
          if (parentType && (parentType.kind === 'OBJECT' || parentType.kind === 'INTERFACE' || parentType.kind === 'UNION')) {
            suggestions.push({
              label: '__typename',
              kind: CIK.Field,
              insertText: '__typename',
              detail: 'String!',
              documentation: 'The name of the current Object type at runtime',
              range,
              sortText: '9___typename',
            });
          }
          // Spread operator
          suggestions.push({
            label: '...',
            kind: CIK.Snippet,
            insertText: '... on ${1:TypeName} {\n  $0\n}',
            insertTextRules: 4,
            detail: 'Inline fragment',
            range,
            sortText: '8_spread',
          });
          break;
        }

        case 'arguments': {
          const parentType = context.parentTypeName ? typesMap.get(context.parentTypeName) : null;
          const field = parentType?.fields?.find(f => f.name === context.fieldName);
          if (field?.args) {
            for (const arg of field.args) {
              const typeStr = resolveTypeName(arg.type);
              suggestions.push({
                label: arg.name,
                kind: CIK.Variable,
                insertText: `${arg.name}: `,
                detail: typeStr,
                documentation: arg.description || undefined,
                range,
                sortText: `2_${arg.name}`,
              });
            }
          }
          break;
        }

        case 'argument-value': {
          // If the argument type is an enum, suggest values
          const parentType = context.parentTypeName ? typesMap.get(context.parentTypeName) : null;
          const field = parentType?.fields?.find(f => f.name === context.fieldName);
          const arg = field?.args?.find(a => a.name === context.argName);
          if (arg) {
            const baseType = getBaseTypeName(arg.type);
            const enumType = baseType ? typesMap.get(baseType) : null;
            if (enumType?.kind === 'ENUM' && enumType.enumValues) {
              for (const ev of enumType.enumValues) {
                suggestions.push({
                  label: ev.name,
                  kind: CIK.Enum,
                  insertText: ev.name,
                  detail: `${baseType} enum value`,
                  documentation: ev.description || undefined,
                  range,
                  sortText: `3_${ev.name}`,
                });
              }
            } else if (baseType === 'Boolean') {
              suggestions.push(
                { label: 'true', kind: CIK.Value, insertText: 'true', detail: 'Boolean', range, sortText: '3_true' },
                { label: 'false', kind: CIK.Value, insertText: 'false', detail: 'Boolean', range, sortText: '3_false' },
              );
            }
          }
          break;
        }

        case 'directive':
          suggestions.push(
            { label: '@skip', kind: CIK.Function, insertText: '@skip(if: $${1:condition})', insertTextRules: 4, detail: 'Directive', documentation: 'Skip this field if condition is true', range, sortText: '5_skip' },
            { label: '@include', kind: CIK.Function, insertText: '@include(if: $${1:condition})', insertTextRules: 4, detail: 'Directive', documentation: 'Include this field if condition is true', range, sortText: '5_include' },
            { label: '@deprecated', kind: CIK.Function, insertText: '@deprecated(reason: "${1:reason}")', insertTextRules: 4, detail: 'Directive', range, sortText: '5_deprecated' },
          );
          break;

        case 'fragment-type': {
          // Suggest type names for "on TypeName"
          const objectTypes = schema.types.filter(t =>
            !t.name.startsWith('__') &&
            (t.kind === 'OBJECT' || t.kind === 'INTERFACE' || t.kind === 'UNION')
          );
          for (const t of objectTypes) {
            suggestions.push({
              label: t.name,
              kind: CIK.Class,
              insertText: t.name,
              detail: t.kind.toLowerCase(),
              documentation: t.description || undefined,
              range,
              sortText: `4_${t.name}`,
            });
          }
          break;
        }

        case 'variable-type': {
          // Suggest input types for variable definitions
          const inputTypes = schema.types.filter(t =>
            !t.name.startsWith('__') &&
            (t.kind === 'SCALAR' || t.kind === 'ENUM' || t.kind === 'INPUT_OBJECT')
          );
          for (const t of inputTypes) {
            suggestions.push({
              label: t.name,
              kind: t.kind === 'ENUM' ? CIK.Enum : t.kind === 'INPUT_OBJECT' ? CIK.Struct : CIK.TypeParameter,
              insertText: t.name,
              detail: t.kind.toLowerCase(),
              documentation: t.description || undefined,
              range,
              sortText: `4_${t.name}`,
            });
          }
          break;
        }
      }

      return { suggestions };
    },
  });
}

// ────────── Internal Helpers ──────────

function buildTypesMap(types: GqlSchemaType[]): Map<string, GqlSchemaType> {
  return new Map(types.map(t => [t.name, t]));
}

function resolveTypeName(t: GqlType): string {
  if (t.kind === 'NON_NULL') return resolveTypeName(t.ofType!) + '!';
  if (t.kind === 'LIST') return '[' + resolveTypeName(t.ofType!) + ']';
  return t.name || 'Unknown';
}

function getBaseTypeName(t: GqlType): string | null {
  if (t.kind === 'NON_NULL' || t.kind === 'LIST') return getBaseTypeName(t.ofType!);
  return t.name;
}

// ────────── Context Detection ──────────

type CompletionContext =
  | { kind: 'top-level' }
  | { kind: 'fields'; typeName: string | null }
  | { kind: 'arguments'; parentTypeName: string | null; fieldName: string }
  | { kind: 'argument-value'; parentTypeName: string | null; fieldName: string; argName: string }
  | { kind: 'directive' }
  | { kind: 'fragment-type' }
  | { kind: 'variable-type' };

function getCompletionContext(
  textBefore: string,
  schema: GqlSchema,
  typesMap: Map<string, GqlSchemaType>,
): CompletionContext {
  // Remove comments and strings for cleaner parsing
  const cleaned = textBefore
    .replace(/#[^\n]*/g, '')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"[^"]*"/g, '""');

  // Check if we're right after @
  if (/\@\w*$/.test(cleaned)) {
    return { kind: 'directive' };
  }

  // Check if we're after "... on " or "fragment X on "
  if (/\.\.\.\s+on\s+\w*$/.test(cleaned) || /fragment\s+\w+\s+on\s+\w*$/.test(cleaned)) {
    return { kind: 'fragment-type' };
  }

  // Check if inside variable type definition ($var: Type)
  if (/\$\w+\s*:\s*\[?\s*\w*$/.test(cleaned)) {
    return { kind: 'variable-type' };
  }

  // Track brace/paren depth to determine context
  const typeStack: (string | null)[] = [];
  let inParens = 0;
  let lastFieldName = '';
  let lastArgName = '';
  let currentParentType: string | null = null;

  // Determine root operation type
  let rootType: string | null = null;
  const opMatch = cleaned.match(/(?:^|\n)\s*(query|mutation|subscription)\b/);
  if (opMatch) {
    const op = opMatch[1];
    if (op === 'query') rootType = schema.queryType?.name || null;
    else if (op === 'mutation') rootType = schema.mutationType?.name || null;
    else if (op === 'subscription') rootType = schema.subscriptionType?.name || null;
  } else if (cleaned.includes('{')) {
    // Shorthand query
    rootType = schema.queryType?.name || null;
  }

  // Tokenize and walk through braces/parens
  let i = 0;
  const len = cleaned.length;
  let currentType: string | null = rootType;
  let prevFieldBeforeBrace = '';

  while (i < len) {
    const ch = cleaned[i];

    if (ch === '{') {
      // Entering a new selection set — find which field precedes this brace
      const beforeBrace = cleaned.slice(0, i).trimEnd();
      const fieldMatch = beforeBrace.match(/(\w+)\s*(?:\([^)]*\))?\s*$/);

      if (typeStack.length === 0) {
        // First brace = operation root
        typeStack.push(currentType);
      } else {
        // Nested brace — resolve type of the field
        const prevType = typeStack[typeStack.length - 1];
        let nextType: string | null = null;

        if (fieldMatch && prevType) {
          const fName = fieldMatch[1];
          const parentTypeObj = typesMap.get(prevType);
          const fieldObj = parentTypeObj?.fields?.find(f => f.name === fName);
          if (fieldObj) {
            nextType = getBaseTypeName(fieldObj.type);
          }
        }
        typeStack.push(nextType);
      }
      prevFieldBeforeBrace = fieldMatch?.[1] || '';
      i++;
      continue;
    }

    if (ch === '}') {
      typeStack.pop();
      i++;
      continue;
    }

    if (ch === '(') {
      inParens++;
      // Capture field name before paren
      const beforeParen = cleaned.slice(0, i).trimEnd();
      const fmatch = beforeParen.match(/(\w+)\s*$/);
      if (fmatch) lastFieldName = fmatch[1];
      currentParentType = typeStack[typeStack.length - 1] || null;
      i++;
      continue;
    }

    if (ch === ')') {
      inParens--;
      i++;
      continue;
    }

    i++;
  }

  // Check if we're currently inside parentheses (arguments)
  if (inParens > 0) {
    // Determine if we're after a colon (argument value) or not
    const afterLastParen = cleaned.slice(cleaned.lastIndexOf('('));
    const argValueMatch = afterLastParen.match(/(\w+)\s*:\s*[^,)]*$/);
    if (argValueMatch) {
      lastArgName = argValueMatch[1];
      return { kind: 'argument-value', parentTypeName: currentParentType, fieldName: lastFieldName, argName: lastArgName };
    }
    return { kind: 'arguments', parentTypeName: currentParentType, fieldName: lastFieldName };
  }

  // If no braces at all, we're at top-level
  if (typeStack.length === 0) {
    return { kind: 'top-level' };
  }

  // We're inside a selection set
  const activeType = typeStack[typeStack.length - 1];
  return { kind: 'fields', typeName: activeType };
}
