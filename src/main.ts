import { mount } from 'svelte';
import { AppSession, IndexedDbGardenStore, MemoryGardenStore } from '@app';
import App from '@ui/App.svelte';
import { Ui } from '@ui/ui.svelte';
import '@ui/styles.css';

/** Saved gardens live in IndexedDB; a browser without it still works, just without saving across visits. */
const store = typeof indexedDB === 'undefined' ? new MemoryGardenStore() : new IndexedDbGardenStore();
const session = new AppSession(store);
const ui = new Ui(session);

void session.init().then(() => {
  mount(App, { target: document.getElementById('app')!, props: { ui } });
});
