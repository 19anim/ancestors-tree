import { vi } from 'vitest';

/** The shims observing something now, for `resizeObserved`. */
const observing = new Set<ResizeObserverShim>();

/**
 * jsdom has no layout engine; React Flow observes sizes and reads the viewport transform. Each
 * observed element reports its size once, on `observe`, and again on `resizeObserved`.
 */
class ResizeObserverShim {
  private readonly callback: ResizeObserverCallback;
  readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.targets.add(target);
    observing.add(this);
    this.report(target);
  }

  report(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    observing.delete(this);
  }
}

/** Tells everything observing `target` that its size changed (set it with `style` first). */
export function resizeObserved(target: Element): void {
  for (const shim of [...observing]) if (shim.targets.has(target)) shim.report(target);
}

class DOMMatrixReadOnlyShim {
  readonly m22: number;

  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

// The prototype patches stay for the rest of the test file (Vitest isolates files); this module
// is only imported by tests.
let prototypesPatched = false;

/** Call in beforeEach: vi.unstubAllGlobals() in afterEach removes the global shims. */
export function mockReactFlow(): void {
  vi.stubGlobal('ResizeObserver', ResizeObserverShim);
  vi.stubGlobal('DOMMatrixReadOnly', DOMMatrixReadOnlyShim);
  if (prototypesPatched) return;
  prototypesPatched = true;
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.height) || 1;
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.width) || 1;
      },
    },
  });
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  });
}
