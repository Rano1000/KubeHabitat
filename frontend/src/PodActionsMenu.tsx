import { useLayoutEffect, useRef, useState } from 'react'
import type { LiveResource } from './useClusterSnapshot'
import { podActions } from './podTroubleshooting'
import type { PodAction } from './podTroubleshooting'

export function PodActionsMenu({
  pod,
  x,
  y,
  onAction,
  onClose,
}: {
  pod: LiveResource
  x: number
  y: number
  onAction: (action: PodAction) => void
  onClose: () => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = menu.current
    const place = () => {
      const bounds = menu.current?.getBoundingClientRect()
      if (bounds)
        setPosition({
          left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
          top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
        })
    }
    place()
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      if (element?.contains(document.activeElement) && previous?.isConnected)
        previous.focus({ preventScroll: true })
    }
  }, [x, y, onClose])
  return (
    <div
      ref={menu}
      className="pod-actions-menu"
      role="menu"
      aria-label={`Actions for pod ${pod.name}`}
      style={position}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault()
          onClose()
          return
        }
        const buttons = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
        )
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          event.key === 'ArrowDown'
            ? (index + 1) % buttons.length
            : event.key === 'ArrowUp'
              ? (index + buttons.length - 1) % buttons.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : -1
        if (next >= 0) {
          event.preventDefault()
          buttons[next]?.focus()
        }
      }}
    >
      <strong>{pod.name}</strong>
      <small>{pod.namespace} · Pod actions</small>
      {podActions.map((action) => (
        <button key={action.id} role="menuitem" onClick={() => onAction(action.id)}>
          {action.label}
        </button>
      ))}
    </div>
  )
}
