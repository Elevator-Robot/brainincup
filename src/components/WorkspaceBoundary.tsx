import { Component, type ErrorInfo, type ReactNode } from 'react';
import WorkspaceLoading from './WorkspaceLoading';

/** Keep failed lazy chunks and startup errors from leaving an unusable shell. */
export default class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace startup failed:', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <WorkspaceLoading failed /> : this.props.children;
  }
}
