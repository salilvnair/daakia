/**
 * AI schema generation prompt templates.
 * One prompt per SchemaLang — each produces clean, production-ready output.
 */
import type { SchemaLang } from './schema-generator';
import type { CodeLanguage } from '../../components/shared/editors/CodeEditor';

export interface SchemaLangMeta {
  label: string;        // display label in the dropdown
  group: string;        // dropdown group header
  badge: string;        // short badge (e.g. "TS", "PY")
  editorLang: CodeLanguage;
  fileExt: string;
  /** True if the static (non-AI) generator supports this lang */
  hasStatic: boolean;
}

export const SCHEMA_LANG_META: Record<SchemaLang, SchemaLangMeta> = {
  'typescript':        { label: 'TypeScript / Interfaces', group: 'TypeScript',  badge: 'TS',    editorLang: 'typescript',  fileExt: 'ts',    hasStatic: true  },
  'typescript-zod':   { label: 'TypeScript / Zod',        group: 'TypeScript',  badge: 'ZOD',   editorLang: 'typescript',  fileExt: 'ts',    hasStatic: false },
  'json-schema':      { label: 'JSON Schema (draft-07)',   group: 'JSON',        badge: 'JSON',  editorLang: 'json',        fileExt: 'json',  hasStatic: false },
  'javascript':       { label: 'JavaScript / JSDoc',       group: 'JavaScript',  badge: 'JS',    editorLang: 'javascript',  fileExt: 'js',    hasStatic: true  },
  'python-pydantic':  { label: 'Python / Pydantic v2',     group: 'Python',      badge: 'PY',    editorLang: 'python',      fileExt: 'py',    hasStatic: false },
  'python-dataclass': { label: 'Python / dataclass',       group: 'Python',      badge: 'PY',    editorLang: 'python',      fileExt: 'py',    hasStatic: true  },
  'java':             { label: 'Java / POJO',               group: 'JVM',         badge: 'JAVA',  editorLang: 'java',        fileExt: 'java',  hasStatic: true  },
  'kotlin':           { label: 'Kotlin / data class',       group: 'JVM',         badge: 'KT',    editorLang: 'plaintext',   fileExt: 'kt',    hasStatic: false },
  'go':               { label: 'Go / struct',               group: 'Systems',     badge: 'GO',    editorLang: 'plaintext',   fileExt: 'go',    hasStatic: false },
  'rust':             { label: 'Rust / serde',              group: 'Systems',     badge: 'RS',    editorLang: 'plaintext',   fileExt: 'rs',    hasStatic: false },
  'csharp':           { label: 'C# / record',               group: '.NET',        badge: 'CS',    editorLang: 'plaintext',   fileExt: 'cs',    hasStatic: false },
  'swift':            { label: 'Swift / Codable',           group: 'Mobile',      badge: 'SWIFT', editorLang: 'plaintext',   fileExt: 'swift', hasStatic: false },
};

/** Order of groups in the dropdown */
export const LANG_GROUP_ORDER = ['TypeScript', 'JavaScript', 'JSON', 'Python', 'JVM', 'Systems', '.NET', 'Mobile'];

/** Build an AI prompt for generating a schema from the given JSON body */
export function buildSchemaPrompt(lang: SchemaLang, jsonPreview: string): string {
  const SHARED_SUFFIX = `\n\nRules:\n- Output ONLY code — no markdown fences, no explanations, no comments outside the schema\n- Handle nested objects and arrays properly\n- Preserve the actual field names from the JSON\n- Use null-safe/optional types where appropriate`;

  switch (lang) {
    case 'typescript':
      return `Generate TypeScript interfaces for this JSON response data.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Export all interfaces with the \`export\` keyword\n- Name the root type "Root" or derive a meaningful name from context\n- Use nested interfaces for nested objects\n- Mark fields that could be null as \`field: Type | null\`\n- Use \`?:\` for truly optional fields${SHARED_SUFFIX}`;

    case 'typescript-zod':
      return `Generate a Zod v3 schema for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Use \`import { z } from 'zod';\` at the top\n- Name the root schema \`RootSchema\` and export it\n- Export the TypeScript type: \`export type Root = z.infer<typeof RootSchema>;\`\n- Use z.nullable() for null values, z.optional() for optional fields\n- Use z.object(), z.array(), z.string(), z.number(), z.boolean() correctly\n- Compose nested schemas as separate named z.object() variables${SHARED_SUFFIX}`;

    case 'json-schema':
      return `Generate a JSON Schema (draft-07) for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Include "$schema": "http://json-schema.org/draft-07/schema#"\n- Include "title" and "description" where meaningful\n- Use $defs for reusable nested object schemas\n- Use "type", "properties", "required", "items" correctly\n- Mark nullable fields with ["type", "null"] array\n- Output valid, minified-friendly JSON${SHARED_SUFFIX}`;

    case 'javascript':
      return `Generate JSDoc type definitions for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Use @typedef {Object} for each shape\n- Use @property for each field with the correct JS type\n- Define nested typedefs before they are referenced\n- Export nothing — just the JSDoc comments\n- End with a /** @type {Root} */ annotated const example${SHARED_SUFFIX}`;

    case 'python-pydantic':
      return `Generate Python Pydantic v2 models for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- \`from pydantic import BaseModel\` and \`from typing import Optional, List, Any\`\n- Name the root model "Root"\n- Define nested models before they are used\n- Use Optional[X] for nullable/missing fields\n- Use List[X] for arrays\n- Add a brief docstring to the root model only${SHARED_SUFFIX}`;

    case 'python-dataclass':
      return `Generate Python dataclasses for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- \`from dataclasses import dataclass, field\` and \`from typing import Optional, List, Any\`\n- Name the root dataclass "Root"\n- Define nested dataclasses before they are used\n- Use Optional[X] = None for nullable fields\n- Use List[X] = field(default_factory=list) for arrays${SHARED_SUFFIX}`;

    case 'java':
      return `Generate Java POJOs with Jackson annotations for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- \`import com.fasterxml.jackson.annotation.*;\`\n- Name the root class "Root"\n- Use private fields with public getters/setters\n- Use @JsonProperty for fields that differ from Java conventions\n- Nest inner classes as static inner classes or separate classes\n- Use List<X> for arrays, String for unknown/null types${SHARED_SUFFIX}`;

    case 'kotlin':
      return `Generate Kotlin data classes with Gson/Moshi annotations for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Name the root class "Root"\n- Use \`data class\` with constructor properties\n- Use \`val\` for all fields\n- Use nullable types (String?) for fields that could be null\n- Use List<X> for arrays\n- Add @SerializedName if field names don't follow Kotlin conventions${SHARED_SUFFIX}`;

    case 'go':
      return `Generate Go structs with JSON tags for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Package name: \`package schema\`\n- Name the root struct "Root"\n- Use pointer types (*string, *int) for nullable fields\n- Use json:"fieldName,omitempty" tags\n- Define nested structs in dependency order (referenced types first)\n- Use []Type for arrays${SHARED_SUFFIX}`;

    case 'rust':
      return `Generate Rust structs with serde for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- \`use serde::{Deserialize, Serialize};\`\n- Name the root struct "Root"\n- Derive #[derive(Debug, Serialize, Deserialize)] on all structs\n- Use Option<T> for nullable/optional fields\n- Use Vec<T> for arrays\n- Use #[serde(rename = "...")] if field names conflict with Rust naming\n- Use snake_case for field names with #[serde(rename_all = "camelCase")] on the struct if needed${SHARED_SUFFIX}`;

    case 'csharp':
      return `Generate C# records with System.Text.Json attributes for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Use C# 9+ record types: \`public record Root(...)\`\n- Or classes with \`public required\` properties for complex scenarios\n- Use [JsonPropertyName("...")] where needed\n- Use nullable reference types (string?, int?) for nullable fields\n- Use List<T> or T[] for arrays\n- Add \`using System.Text.Json.Serialization;\`${SHARED_SUFFIX}`;

    case 'swift':
      return `Generate Swift Codable structs for this JSON response.\n\nJSON:\n${jsonPreview}\n\nRequirements:\n- Name the root struct "Root"\n- Conform to \`Codable\` (both Encodable and Decodable)\n- Use optional types (String?, Int?) for nullable fields\n- Use [T] for arrays\n- Add \`CodingKeys\` enum when JSON keys don't match Swift naming (camelCase)\n- Make all structs value types (struct not class)${SHARED_SUFFIX}`;

    default:
      return `Generate a data schema for this JSON:\n\n${jsonPreview}`;
  }
}

/** Badge color per group — uses CSS variables so they respect the active theme */
export const GROUP_BADGE_COLORS: Record<string, string> = {
  'TypeScript': 'var(--color-method-put)',       // blue
  'JavaScript': 'var(--color-warning)',           // amber
  'JSON':       'var(--color-success)',           // green
  'Python':     'var(--color-method-head)',       // cyan
  'JVM':        'var(--color-method-post)',       // amber-orange
  'Systems':    'var(--color-error)',             // red
  '.NET':       'var(--color-protocol-mqtt)',     // violet
  'Mobile':     'var(--color-method-options)',    // pink
};

/**
 * Pre-built SelectOption-compatible list for the language picker.
 * Shared by DataSchemaModal and DuiShowcase — single source of truth.
 * Typed as a plain object array so the service layer stays DUI-free.
 */
export const SCHEMA_LANG_OPTIONS: Array<{
  value: string;
  label: string;
  isHeader?: boolean;
  badge?: { label: string; color: string };
}> = [
  { value: 'h-ts',             label: 'TypeScript',            isHeader: true },
  { value: 'typescript',       label: 'TypeScript / Interfaces', badge: { label: 'TS',    color: GROUP_BADGE_COLORS['TypeScript'] } },
  { value: 'typescript-zod',   label: 'TypeScript / Zod',        badge: { label: 'ZOD',   color: GROUP_BADGE_COLORS['TypeScript'] } },
  { value: 'h-js',             label: 'JavaScript',            isHeader: true },
  { value: 'javascript',       label: 'JavaScript / JSDoc',       badge: { label: 'JS',    color: GROUP_BADGE_COLORS['JavaScript'] } },
  { value: 'h-json',           label: 'JSON',                  isHeader: true },
  { value: 'json-schema',      label: 'JSON Schema (draft-07)',   badge: { label: 'JSON',  color: GROUP_BADGE_COLORS['JSON']       } },
  { value: 'h-py',             label: 'Python',                isHeader: true },
  { value: 'python-pydantic',  label: 'Python / Pydantic v2',    badge: { label: 'PY',    color: GROUP_BADGE_COLORS['Python']     } },
  { value: 'python-dataclass', label: 'Python / dataclass',      badge: { label: 'PY',    color: GROUP_BADGE_COLORS['Python']     } },
  { value: 'h-jvm',            label: 'JVM',                   isHeader: true },
  { value: 'java',             label: 'Java / POJO',              badge: { label: 'JAVA',  color: GROUP_BADGE_COLORS['JVM']        } },
  { value: 'kotlin',           label: 'Kotlin / data class',      badge: { label: 'KT',    color: GROUP_BADGE_COLORS['JVM']        } },
  { value: 'h-sys',            label: 'Systems',               isHeader: true },
  { value: 'go',               label: 'Go / struct',              badge: { label: 'GO',    color: GROUP_BADGE_COLORS['Systems']    } },
  { value: 'rust',             label: 'Rust / serde',             badge: { label: 'RS',    color: GROUP_BADGE_COLORS['Systems']    } },
  { value: 'h-net',            label: '.NET',                  isHeader: true },
  { value: 'csharp',           label: 'C# / record',              badge: { label: 'CS',    color: GROUP_BADGE_COLORS['.NET']       } },
  { value: 'h-mobile',         label: 'Mobile',                isHeader: true },
  { value: 'swift',            label: 'Swift / Codable',          badge: { label: 'SWIFT', color: GROUP_BADGE_COLORS['Mobile']     } },
];
