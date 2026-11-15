/**
 * Organizing a Swagger import before it is created: each drag in the wizard
 * is one of these calls, so each rule a wrong drop would break is here.
 */
import { describe, it, expect } from 'vitest';
import {
  arrange, moveInto, moveBefore, addFolder, unwrapFolder, treeRows, foldersInUse, requestName, setOn,
  type OutlineOp,
} from './arrange';

const op = (method: string, path: string, tag: string, summary = '', deprecated = false): OutlineOp => ({
  id: `${method} ${path}`, method, path, tag, summary, operationId: summary.replace(/\s/g, ''), deprecated, security: [],
});
const OPS = [
  op('GET', '/pet/{petId}', 'pet', 'Find pet by ID'),
  op('DELETE', '/pet/{petId}', 'pet', 'Deletes a pet'),
  op('GET', '/store/inventory', 'store', 'Inventory'),
  op('GET', '/store/order/{orderId}', 'store', 'Find order'),
  op('GET', '/user/logout', 'user', 'Log out', true),
];

describe('grouping', () => {
  it('by tag, one folder per tag; deprecated operations start unticked', () => {
    const a = arrange(OPS, 'tag');
    expect(a.folders.map(f => f.name)).toEqual(['pet', 'store', 'user']);
    expect(a.requests.find(r => r.opId === 'GET /user/logout')!.on).toBe(false);
  });

  it('by path, nesting each resource that takes a parameter', () => {
    const a = arrange(OPS, 'path');
    const names = treeRows(a).filter(r => r.kind === 'folder').map(r => (r.kind === 'folder' ? `${'  '.repeat(r.depth)}${r.folder.name}` : ''));
    expect(names).toEqual(['pet', '  {petId}', 'store', '  order/{orderId}', 'user']);
  });

  it('flat, no folders; and ticks survive a regroup', () => {
    const ticked = setOn(arrange(OPS, 'tag'), new Set(['GET /pet/{petId}']), false);
    const flat = arrange(OPS, 'flat', new Map(ticked.requests.map(r => [r.opId, r.on])));
    expect(flat.folders).toEqual([]);
    expect(flat.requests.find(r => r.opId === 'GET /pet/{petId}')!.on).toBe(false);
  });
});

describe('dragging', () => {
  it('a request onto a folder moves it there and opens the folder', () => {
    let a = arrange(OPS, 'tag');
    a = { ...a, folders: a.folders.map(f => ({ ...f, open: false })) };
    const store = a.folders.find(f => f.name === 'store')!;
    a = moveInto(a, { kind: 'request', id: 'GET /pet/{petId}' }, store.id);
    expect(a.requests.find(r => r.opId === 'GET /pet/{petId}')!.folderId).toBe(store.id);
    expect(a.folders.find(f => f.id === store.id)!.open).toBe(true);
  });

  it('a request onto another request goes just above it, in that folder', () => {
    let a = arrange(OPS, 'tag');
    a = moveBefore(a, { kind: 'request', id: 'GET /store/order/{orderId}' }, 'GET /pet/{petId}');
    const pet = a.folders.find(f => f.name === 'pet')!;
    expect(a.requests.filter(r => r.folderId === pet.id).map(r => r.opId)).toEqual(['GET /store/order/{orderId}', 'GET /pet/{petId}', 'DELETE /pet/{petId}']);
  });

  it('a folder into another nests it — but never into itself or below itself', () => {
    let a = arrange(OPS, 'tag');
    const [pet, store] = a.folders;
    a = moveInto(a, { kind: 'folder', id: store.id }, pet.id);
    expect(a.folders.find(f => f.id === store.id)!.parentId).toBe(pet.id);
    const same = moveInto(a, { kind: 'folder', id: pet.id }, store.id);
    expect(same).toBe(a);
    expect(moveInto(a, { kind: 'folder', id: pet.id }, pet.id)).toBe(a);
  });

  it('to the top level, with null', () => {
    let a = arrange(OPS, 'tag');
    a = moveInto(a, { kind: 'request', id: 'GET /store/inventory' }, null);
    expect(a.requests.find(r => r.opId === 'GET /store/inventory')!.folderId).toBeNull();
  });
});

describe('folders', () => {
  it('a new subfolder opens its parent; removing a folder keeps what was in it', () => {
    let a = arrange(OPS, 'tag');
    const pet = a.folders[0];
    const { next, id } = addFolder({ ...a, folders: a.folders.map(f => ({ ...f, open: false })) }, pet.id, 'by id');
    expect(next.folders.find(f => f.id === pet.id)!.open).toBe(true);
    a = moveInto(next, { kind: 'request', id: 'GET /pet/{petId}' }, id);
    a = unwrapFolder(a, id);
    expect(a.folders.some(f => f.id === id)).toBe(false);
    expect(a.requests.find(r => r.opId === 'GET /pet/{petId}')!.folderId).toBe(pet.id);
  });

  it('only folders holding a ticked request are created', () => {
    const a = arrange(OPS, 'tag');
    expect(foldersInUse(a).map(f => f.name)).toEqual(['pet', 'store']);
  });
});

it('names a request by summary, operationId, or method and path', () => {
  expect(requestName(OPS[0], 'summary')).toBe('Find pet by ID');
  expect(requestName(OPS[0], 'operationId')).toBe('FindpetbyID');
  expect(requestName(OPS[0], 'path')).toBe('GET /pet/{petId}');
});
