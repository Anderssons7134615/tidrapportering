import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { createServer } from 'vite';

const tabs = [
  { id: 'overview', label: 'Översikt' },
  { id: 'materials', label: 'Material' },
  { id: 'notes', label: 'Dagbok' },
];

let dom;
let vite;
let Tabs;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ Tabs } = await vite.ssrLoadModule('/src/components/ui/design.tsx'));
});

afterEach(() => cleanup());

after(async () => {
  await vite?.close();
  dom?.window.close();
});

function TabsHarness({ label }) {
  const [active, setActive] = useState('overview');

  return React.createElement(
    Tabs,
    { tabs, active, onChange: setActive, label },
    React.createElement('p', null, `Panel ${active}`),
  );
}

test('varje Tabs-instans kopplar unika flikar till sin aktiva panel', () => {
  const view = render(React.createElement(
    'div',
    null,
    React.createElement(TabsHarness, { label: 'Första projektet' }),
    React.createElement(TabsHarness, { label: 'Andra projektet' }),
  ));

  const tabLists = view.getAllByRole('tablist');
  const panels = view.getAllByRole('tabpanel');
  assert.equal(tabLists.length, 2);
  assert.equal(panels.length, 2);
  assert.notEqual(panels[0].id, panels[1].id);

  tabLists.forEach((tabList, instanceIndex) => {
    const instanceTabs = within(tabList).getAllByRole('tab');
    assert.equal(instanceTabs[0].getAttribute('tabindex'), '0');
    assert.equal(instanceTabs[1].getAttribute('tabindex'), '-1');
    assert.equal(instanceTabs[2].getAttribute('tabindex'), '-1');
    assert.equal(instanceTabs[0].getAttribute('aria-controls'), panels[instanceIndex].id);
    assert.equal(panels[instanceIndex].getAttribute('aria-labelledby'), instanceTabs[0].id);
    instanceTabs.forEach((tab) => {
      const controlledPanel = document.getElementById(tab.getAttribute('aria-controls'));
      assert.ok(controlledPanel);
      assert.equal(controlledPanel.getAttribute('role'), 'tabpanel');
      assert.equal(controlledPanel.getAttribute('aria-labelledby'), tab.id);
    });
  });
});

test('piltangenter, Home och End flyttar fokus och aktiverar rätt flik', () => {
  const view = render(React.createElement(TabsHarness, { label: 'Projektinnehåll' }));
  const getTabs = () => view.getAllByRole('tab');

  getTabs()[0].focus();
  fireEvent.keyDown(getTabs()[0], { key: 'ArrowRight' });
  assert.equal(getTabs()[1].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, getTabs()[1]);

  fireEvent.keyDown(getTabs()[1], { key: 'End' });
  assert.equal(getTabs()[2].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, getTabs()[2]);

  fireEvent.keyDown(getTabs()[2], { key: 'ArrowRight' });
  assert.equal(getTabs()[0].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, getTabs()[0]);

  fireEvent.keyDown(getTabs()[0], { key: 'ArrowLeft' });
  assert.equal(getTabs()[2].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, getTabs()[2]);

  fireEvent.keyDown(getTabs()[2], { key: 'Home' });
  assert.equal(getTabs()[0].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, getTabs()[0]);
});

test('flikraden behåller horisontell mobilscroll och 44 px-träffyta', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  const view = render(React.createElement(TabsHarness, { label: 'Projektinnehåll' }));
  const tabList = view.getByRole('tablist');
  const instanceTabs = view.getAllByRole('tab');

  assert.match(tabList.className, /overflow-x-auto/);
  instanceTabs.forEach((tab) => {
    assert.match(tab.className, /min-h-11/);
    assert.match(tab.className, /min-w-11/);
    assert.match(tab.className, /whitespace-nowrap/);
  });

  fireEvent.click(instanceTabs[2]);
  assert.equal(instanceTabs[2].getAttribute('aria-selected'), 'true');
  assert.match(view.getByRole('tabpanel').textContent, /Panel notes/);
});

test('första synliga fliken tar över om aktiv flik filtreras bort', async () => {
  let changedTo = null;
  const view = render(React.createElement(
    Tabs,
    {
      tabs: tabs.slice(0, 2),
      active: 'summary',
      onChange: (id) => { changedTo = id; },
      label: 'Projektinnehåll',
    },
    React.createElement('p', null, 'Synligt projektinnehåll'),
  ));

  const instanceTabs = view.getAllByRole('tab');
  assert.equal(instanceTabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(instanceTabs[0].getAttribute('tabindex'), '0');
  assert.equal(view.getByRole('tabpanel').getAttribute('aria-labelledby'), instanceTabs[0].id);
  await waitFor(() => assert.equal(changedTo, 'overview'));
});
