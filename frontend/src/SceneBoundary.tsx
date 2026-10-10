import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('KubeHabitat scene unavailable', error, info.componentStack)
  }
  render() {
    if (this.state.failed)
      return (
        <div className="scene-fallback" role="status">
          <strong>3D view unavailable</strong>
          <p>
            Your browser could not initialize the scene. The resource list and details panel are
            still available.
          </p>
        </div>
      )
    return this.props.children
  }
}
