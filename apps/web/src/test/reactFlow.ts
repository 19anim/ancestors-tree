import { vi } from 'vitest';

/** jsdom has no layout engine; React Flow observes sizes and reads the viewport transform. */
class ResizeObserverShim {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve(): void {
    // Nothing is observed for real.
  }

  disconnect(): void {
    // Nothing is observed for real.
  }
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
