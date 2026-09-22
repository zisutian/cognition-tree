import { Component, type ReactNode } from "react";

/** Keep the workbench available when a lazy activity cannot render. */
export class ActivityErrorBoundary extends Component<
  {
    children: ReactNode;
    onError(error: Error): void;
    fallback(retry: () => void): ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}
