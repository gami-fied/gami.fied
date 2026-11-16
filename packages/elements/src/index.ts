import { GamiProvider } from '@gami.fied/react';
import { Gami } from '@gami.fied/sdk';
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { ELEMENTS, propsFrom, type ElementDefinition } from './definitions.js';

export { ELEMENTS, propsFrom, readAttribute } from './definitions.js';
export type { AttributeKind, ElementDefinition } from './definitions.js';

/*
 * Gami.Fied as HTML elements, for sites that do not use React: Vue, Svelte, or a plain page.
 *
 *   <script src="gami-elements.js"></script>
 *   <script>GamiElements.configure({ baseUrl: 'https://gami.example.com', token: tokenFromYourServer })</script>
 *   <gami-level-progress></gami-level-progress>
 *   <gami-leaderboard period="weekly" limit="5"></gami-leaderboard>
 *
 * Every element on a page shares one connection and one live stream. Each draws inside its own
 * shadow root, so your CSS and its CSS leave each other alone. Colours are CSS variables such as
 * `--gami-accent`, which do cross into a shadow root, so set them on the element or any parent.
 */

/** The stylesheet from @gami.fied/react, put in by the build. Empty when run from source. */
declare const __GAMI_CSS__: string | undefined;
const CSS = typeof __GAMI_CSS__ === 'string' ? __GAMI_CSS__ : '';

export interface ElementsConfig {
  /** Where your Gami.Fied server is. */
  baseUrl: string;
  /** A player token your server made. Safe in a page. */
  token: string;
  /** Keep a live connection for instant updates. Defaults to on. */
  live?: boolean;
  /** The language to ask for, such as `pt-BR`. The browser's own is used without it. */
  locale?: string;
}

interface Mounted {
  host: HTMLElement;
  mount: HTMLElement;
  definition: ElementDefinition;
  /** Stays the same for as long as the element is on the page. */
  id: number;
  /** Goes up when an attribute changes, so the element is drawn again. */
  revision: number;
}

interface State {
  client: Gami | null;
  live: boolean;
  elements: Mounted[];
}

let state: State = { client: null, live: true, elements: [] };
const listeners = new Set<() => void>();
const change = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

let lastConfig: ElementsConfig | null = null;

/** Connects every element on the page. Call it again, or `setToken`, when the token expires. */
export function configure(config: ElementsConfig): void {
  if (!config?.baseUrl || !config?.token) throw new Error('GamiElements.configure needs a baseUrl and a token.');
  lastConfig = config;
  change({ client: new Gami({ endUserToken: config.token, baseUrl: config.baseUrl, locale: config.locale }), live: config.live !== false });
  start();
}

/** Swaps in a fresh token, keeping the address, the language and the live setting. */
export function setToken(token: string): void {
  if (!lastConfig) throw new Error('Call GamiElements.configure first.');
  configure({ ...lastConfig, token });
}

/** The SDK client the elements use, for your own calls. Null until `configure` is called. */
export const client = (): Gami | null => state.client;

/** Draws every mounted element through one React tree, so they share a connection. */
function App(): ReactNode {
  const current = useSyncExternalStore(subscribe, () => state);
  if (!current.client) return null;
  return createElement(GamiProvider, {
    client: current.client,
    live: current.live,
    children: createElement(
      Fragment,
      null,
      current.elements.map((entry) => {
        const props = propsFrom(entry.definition, (name) => entry.host.getAttribute(name));
        // A component's callback becomes an event on the element, which any framework can listen to.
        for (const [prop, eventName] of Object.entries(entry.definition.events ?? {})) {
          props[prop] = (...detail: unknown[]) => entry.host.dispatchEvent(new CustomEvent(eventName, { detail: detail.length === 1 ? detail[0] : detail, bubbles: true, composed: true }));
        }
        return createPortal(createElement(entry.definition.component, props), entry.mount, String(entry.id));
      })
    ),
  });
}

let root: Root | null = null;
let nextId = 1;
function start(): void {
  if (root || typeof document === 'undefined') return;
  // Never attached to the page: the elements are drawn through portals into their own shadow roots.
  root = createRoot(document.createElement('div'));
  root.render(createElement(App));
}

function elementClass(definition: ElementDefinition): CustomElementConstructor {
  return class GamiElement extends HTMLElement {
    static observedAttributes = Object.keys(definition.attributes);
    private entry: Mounted | null = null;

    connectedCallback(): void {
      const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      if (!shadow.firstChild) {
        const style = document.createElement('style');
        style.textContent = `:host { display: block; }\n${CSS}`;
        shadow.append(style, document.createElement('div'));
      }
      this.entry = { host: this, mount: shadow.lastElementChild as HTMLElement, definition, id: nextId++, revision: 0 };
      change({ elements: [...state.elements, this.entry] });
      start();
    }

    disconnectedCallback(): void {
      change({ elements: state.elements.filter((entry) => entry !== this.entry) });
      this.entry = null;
    }

    attributeChangedCallback(): void {
      if (!this.entry) return;
      const next = { ...this.entry, revision: this.entry.revision + 1 };
      change({ elements: state.elements.map((entry) => (entry === this.entry ? next : entry)) });
      this.entry = next;
    }
  };
}

/** Registers the elements. It runs by itself when the script loads in a browser. */
export function defineElements(): void {
  if (typeof customElements === 'undefined') return;
  for (const [tag, definition] of Object.entries(ELEMENTS)) {
    if (!customElements.get(tag)) customElements.define(tag, elementClass(definition));
  }
}

defineElements();
