import type React from 'react';
import { TableIcon, BracesIcon, XmlTagIcon, CodeIcon, SchemaIcon, FileTextIcon, FileUploadIcon, CloseIcon } from '../../../icons';

/** Content type → bodyMode mapping */
export const CONTENT_TYPE_MODE: Record<string, string> = {
  'none': 'none',
  'application/json': 'json',
  'application/ld+json': 'json',
  'application/hal+json': 'json',
  'application/vnd.api+json': 'json',
  'application/xml': 'raw',
  'text/xml': 'raw',
  'application/soap+xml': 'raw',
  'application/x-www-form-urlencoded': 'x-www-form-urlencoded',
  'multipart/form-data': 'form-data',
  'application/octet-stream': 'binary',
  'text/html': 'raw',
  'text/plain': 'raw',
  'text/css': 'raw',
  'text/csv': 'raw',
  'text/markdown': 'raw',
  'application/javascript': 'raw',
  'application/graphql': 'raw',
  'application/yaml': 'raw',
  'application/msgpack': 'binary',
};

/** Content type → Monaco editor language */
export const CONTENT_TYPE_LANG: Record<string, string> = {
  'application/json': 'json',
  'application/ld+json': 'json',
  'application/hal+json': 'json',
  'application/vnd.api+json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/soap+xml': 'xml',
  'text/html': 'html',
  'text/plain': 'plaintext',
  'text/css': 'css',
  'text/csv': 'plaintext',
  'text/markdown': 'markdown',
  'application/javascript': 'javascript',
  'application/graphql': 'graphql',
  'application/yaml': 'yaml',
};

/** Placeholder text shown in the editor when the body is empty */
export const CONTENT_TYPE_PLACEHOLDER: Record<string, string> = {
  'application/json': '{\n  "key": "value"\n}',
  'application/ld+json': '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "value"\n}',
  'application/hal+json': '{\n  "_links": {\n    "self": { "href": "/resource/1" }\n  },\n  "key": "value"\n}',
  'application/vnd.api+json': '{\n  "data": {\n    "type": "articles",\n    "id": "1",\n    "attributes": {\n      "title": "value"\n    }\n  }\n}',
  'application/xml': '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <element>value</element>\n</root>',
  'text/xml': '<root>\n  <element>value</element>\n</root>',
  'application/soap+xml': '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <!-- Your operation here -->\n  </soapenv:Body>\n</soapenv:Envelope>',
  'text/html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',
  'text/plain': 'Plain text content here',
  'text/css': '/* CSS Styles */\nbody {\n  margin: 0;\n  padding: 0;\n}',
  'text/csv': 'column1,column2,column3\nvalue1,value2,value3',
  'text/markdown': '# Title\n\n> Blockquote\n\nContent here',
  'application/javascript': '// JavaScript code\nconst data = {};\nconsole.log(data);',
  'application/graphql': '{\n  # Your GraphQL query\n  query {\n    field\n  }\n}',
  'application/yaml': '# YAML content\nkey: value\nlist:\n  - item1\n  - item2',
};

/**
 * What the Body type dropdown offers.
 *
 * It used to list twenty-six MIME strings under six headers —
 * `application/vnd.api+json`, `text/css`, `application/msgpack` — which is a
 * spec index, not a menu. Nobody scans it; they scroll it looking for JSON.
 *
 * Nine entries now, named for what they DO rather than for the header they
 * send, each with the glyph of the editor it opens: a table for the form
 * types, braces for JSON, a tag for XML. The exotic types are all still
 * valid values — an imported request that carries one keeps working, shows
 * it in this list, and can set any header it likes from the Headers tab.
 */
export const CONTENT_TYPE_OPTIONS: BodyTypeOption[] = [
  { value: '_h_form', label: 'Form', isHeader: true },
  { value: 'multipart/form-data', label: 'Multipart Form', icon: <TableIcon size={13} /> },
  { value: 'application/x-www-form-urlencoded', label: 'Form URL Encoded', icon: <TableIcon size={13} /> },
  { value: '_h_raw', label: 'Raw', isHeader: true },
  { value: 'application/json', label: 'JSON', icon: <BracesIcon size={13} /> },
  { value: 'application/xml', label: 'XML', icon: <XmlTagIcon size={13} /> },
  { value: 'text/html', label: 'HTML', icon: <CodeIcon size={13} /> },
  { value: 'application/yaml', label: 'YAML', icon: <SchemaIcon size={13} /> },
  { value: 'text/plain', label: 'Text', icon: <FileTextIcon size={13} /> },
  { value: '_h_other', label: 'Other', isHeader: true },
  { value: 'application/octet-stream', label: 'File / Binary', icon: <FileUploadIcon size={13} /> },
  { value: 'none', label: 'No Body', icon: <CloseIcon size={13} /> },
];

export interface BodyTypeOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  isHeader?: boolean;
}

/**
 * The list, plus whatever this request already carries.
 *
 * A collection imported from an OpenAPI document can hold
 * `application/hal+json`; dropping it from the menu must not make the value
 * invisible in the control that shows it. It joins the top under its own
 * header, spelled out, so it reads as the exception it is.
 */
export function bodyTypeOptions(current: string): BodyTypeOption[] {
  if (!current || CONTENT_TYPE_OPTIONS.some(o => o.value === current)) return CONTENT_TYPE_OPTIONS;
  return [
    { value: '_h_current', label: 'This request', isHeader: true },
    { value: current, label: current, icon: <FileTextIcon size={13} /> },
    ...CONTENT_TYPE_OPTIONS,
  ];
}
