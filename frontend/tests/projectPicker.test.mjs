import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { useState } from 'react';
import { createServer } from 'vite';

let dom, vite, ProjectPicker, render, fireEvent, cleanup;
const projects = [
  { id: 'a', code: '0042', name: 'Panncentral', customer: { name: 'Statkraft' } },
  { id: 'b', code: '0100', name: 'Skolan', customer: { name: 'Kommunen' } },
];
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  ({ render, fireEvent, cleanup } = await import('@testing-library/react'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ ProjectPicker } = await vite.ssrLoadModule('/src/components/ProjectPicker.tsx'));
});
afterEach(() => cleanup());
after(async () => { await vite?.close(); dom?.window.close(); });
function Harness({ initial = '', items = projects } = {}) {
  const [value, setValue] = useState(initial);
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: 'project' }, 'Projekt'),
    React.createElement(ProjectPicker, { id: 'project', projects: items, value, onChange: setValue, required: true }),
    React.createElement('span', { 'data-testid': 'selected' }, value),
    React.createElement('button', { onClick: () => setValue('b') }, 'Senast använda'));
}
test('searches name, number and customer and chooses a real project with keyboard', () => {
  const view = render(React.createElement(Harness));
  const input = view.getByRole('combobox');
  for (const query of ['pann', '0042', 'STATKRAFT', '42 stat']) {
    fireEvent.change(input, { target: { value: query } });
    assert.equal(view.getAllByRole('option').length, 1);
    assert.match(view.getByRole('option').textContent, /Panncentral/);
  }
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  assert.equal(view.getByTestId('selected').textContent, 'a');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.match(input.value, /Panncentral/);
});
test('unmatched free text never becomes a project; Escape preserves selected project', () => {
  const view = render(React.createElement(Harness, { initial: 'a' }));
  const input = view.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'finns inte' } });
  assert.match(view.getByRole('status').textContent, /Inga projekt/);
  fireEvent.keyDown(input, { key: 'Enter' });
  assert.equal(view.getByTestId('selected').textContent, 'a');
  fireEvent.keyDown(input, { key: 'Escape' });
  assert.match(input.value, /Panncentral/);
  fireEvent.click(view.getByRole('button', { name: 'Rensa projektval' }));
  assert.equal(view.getByTestId('selected').textContent, '');
});
test('pointer selection and recent-project changes update the displayed project', () => {
  const view = render(React.createElement(Harness));
  fireEvent.focus(view.getByRole('combobox'));
  fireEvent.click(view.getByRole('option', { name: /Panncentral/ }));
  assert.equal(view.getByTestId('selected').textContent, 'a');
  fireEvent.click(view.getByRole('button', { name: 'Senast använda' }));
  assert.match(view.getByRole('combobox').value, /Skolan/);
});
test('large cached project lists remain searchable', () => {
  const view = render(React.createElement(Harness, { items: Array.from({ length: 60 }, (_, i) => ({ id: String(i), code: String(i), name: `Projekt ${i}` })) }));
  const input = view.getByRole('combobox');
  fireEvent.focus(input);
  assert.equal(view.getAllByRole('option').length, 30);
  assert.match(view.getByRole('status').textContent, /30 av 60/);
  fireEvent.change(input, { target: { value: '59' } });
  fireEvent.click(view.getByRole('option'));
  assert.equal(view.getByTestId('selected').textContent, '59');
});

test('empty project list announces no matches and exposes required state', () => {
  const view = render(React.createElement(Harness, { items: [] }));
  const input = view.getByRole('combobox');
  assert.equal(input.getAttribute('aria-required'), 'true');
  fireEvent.focus(input);
  assert.equal(view.queryAllByRole('option').length, 0);
  assert.match(view.getByRole('status').textContent, /Inga projekt/);
});
