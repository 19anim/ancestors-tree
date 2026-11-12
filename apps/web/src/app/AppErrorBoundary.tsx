import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Shown when the app cannot start (i18n failed to load, or a render error outside the
 * router). The text is hard-coded in both languages because i18n may be what failed.
 */
export function BootFailure() {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16 text-ink">
      <p lang="vi">Ứng dụng gặp lỗi khi khởi động. Hãy tải lại trang.</p>
      <p lang="en" className="text-ink-muted">
        The app failed to start. Please reload the page.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 h-10 self-start rounded-control bg-ink px-4 text-sm font-medium text-paper"
      >
        Tải lại trang · Reload
      </button>
    </div>
  );
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.error ? <BootFailure /> : this.props.children;
  }
}
