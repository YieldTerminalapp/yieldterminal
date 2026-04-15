import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { err?: Error }

export default class VaultGuard extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[VaultGuard]', err, info.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="min-h-screen bg-onyx text-silver flex items-center justify-center px-6">
        <div className="max-w-xl w-full border border-blood p-8">
          <div className="label !text-blood mb-3">✕ RUNTIME FAULT</div>
          <h1 className="font-display text-4xl font-black mb-4">SOMETHING BROKE.</h1>
          <p className="font-mono text-xs uppercase tracking-widest2 text-smoke leading-relaxed mb-6">
            The terminal hit an unhandled error. Your on-chain state is safe — this crash is purely UI.
          </p>
          <pre className="font-mono text-[11px] text-smoke border border-steel p-3 overflow-x-auto max-h-40 mb-6">{this.state.err.message}</pre>
          <button
            onClick={() => { this.setState({ err: undefined }); location.reload(); }}
            className="bg-acid text-onyx px-6 py-3 font-mono text-[11px] uppercase tracking-widest2 font-semibold hover:bg-silver"
          >
            RELOAD →
          </button>
        </div>
      </div>
    );
  }
}
