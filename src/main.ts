import './ui/tokens/tokens.css';
import './ui/tokens/base.css';
import { mount } from 'svelte';
import { createController, createIndexedDbStore, createMemoryStore, indexedDbAvailable } from '@app';
import App from './ui/App.svelte';

/**
 * Composition root: the only place that picks concrete implementations.
 * Browser storage is IndexedDB; if it is unavailable (some private-browsing
 * modes) the book still works for the session but will not remember pages.
 */
const persistent = await indexedDbAvailable();
if (!persistent) console.warn('IndexedDB is unavailable; pages will not survive a reload.');

const controller = createController({
  store: persistent ? createIndexedDbStore() : createMemoryStore(),
});
void controller.init();

mount(App, { target: document.getElementById('app') as HTMLElement, props: { controller } });
