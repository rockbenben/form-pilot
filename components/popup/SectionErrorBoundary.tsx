import React from 'react';

interface Props {
  /** Changing this remounts the boundary, so switching section clears an error. */
  resetKey: string;
  fallbackTitle: string;
  fallbackHint: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one failing section from taking the whole Dashboard with it.
 *
 * Without this, a single bad record in storage — a `drafts` value that is an
 * array where the store expects a Record, anything written by an older build
 * or a half-completed write — threw during render and React unmounted the
 * entire tree. The user got a black page: no header, no sidebar, no way to
 * navigate to a section that still worked, and nothing on screen saying what
 * had happened. Their profile was intact the whole time and they had no way to
 * reach it.
 *
 * The error is scoped to the content area, so the sidebar survives and the
 * next section the user picks remounts a fresh boundary.
 */
export default class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Section crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded border border-red-900/60 bg-red-950/30 px-4 py-3">
        <p className="text-sm font-medium text-red-300">{this.props.fallbackTitle}</p>
        <p className="mt-1 text-xs text-red-200/70 leading-relaxed">{this.props.fallbackHint}</p>
        <pre className="mt-2 overflow-x-auto text-[11px] text-red-200/50 whitespace-pre-wrap">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
