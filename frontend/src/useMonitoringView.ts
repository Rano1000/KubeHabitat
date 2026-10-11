import { useEffect, useRef, useState } from 'react'

/** Keep the live scene mounted while switching between page and monitoring layouts. */
export function useMonitoringView() {
  const root = useRef<HTMLElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const exitButton = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [notice, setNotice] = useState('')
  const [panel, setPanel] = useState<'components' | 'details' | null>(null)

  const requestFullscreen = async () => {
    if (!root.current?.requestFullscreen || !document.fullscreenEnabled) {
      setNotice(
        'Full screen is unavailable in this browser. The expanded window remains available.',
      )
      return
    }
    try {
      await root.current.requestFullscreen()
      setNotice('')
    } catch {
      setNotice('This browser kept the expanded window. You can continue monitoring here.')
    }
  }
  const enter = () => {
    setExpanded(true)
    setPanel(null)
    setNotice('')
    void requestFullscreen()
  }
  const exit = () => {
    setExpanded(false)
    if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {})
  }

  useEffect(() => {
    const change = () => {
      const active = document.fullscreenElement === root.current
      setFullscreen(active)
      // Browser Escape returns to the original page layout too.
      if (!active) setExpanded(false)
    }
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])

  useEffect(() => {
    if (!expanded || !root.current) return
    const scroll = window.scrollY
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Background navigation must also be inaccessible to keyboard users.
    const siblings = Array.from(root.current.parentElement?.children ?? [])
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== root.current,
      )
      .map((element) => ({ element, inert: element.inert }))
    siblings.forEach(({ element }) => {
      element.inert = true
    })
    exitButton.current?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        setExpanded(false)
        if (document.fullscreenElement === root.current)
          void document.exitFullscreen().catch(() => {})
      }
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = overflow
      siblings.forEach(({ element, inert }) => {
        element.inert = inert
      })
      document.removeEventListener('keydown', escape)
      window.scrollTo({ top: scroll, behavior: 'instant' })
      expandButton.current?.focus({ preventScroll: true })
    }
  }, [expanded])

  return {
    root,
    expandButton,
    exitButton,
    expanded,
    fullscreen,
    notice,
    panel,
    setPanel,
    enter,
    exit,
    requestFullscreen,
  }
}
