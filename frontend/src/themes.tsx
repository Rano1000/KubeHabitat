import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemeId = 'midnight' | 'garden' | 'blueprint' | 'pearl' | 'aurora' | 'slate'
export const isModernTheme = (theme: ThemeId) => ['pearl', 'aurora', 'slate'].includes(theme)
export const themeMotion = (theme: ThemeId) =>
  theme === 'pearl'
    ? { float: 0.055, spin: 0.1, walk: 0.48 }
    : theme === 'aurora'
      ? { float: 0.085, spin: 0.14, walk: 0.58 }
      : theme === 'slate'
        ? { float: 0.035, spin: 0.07, walk: 0.45 }
        : { float: 0.1, spin: 0.18, walk: 0.65 }
export const themes = {
  midnight: {
    name: 'Midnight Habitat',
    description: 'The original glowing cluster house',
    background: '#0d1726',
    floor: '#142639',
    frame: '#7494ad',
    room: '#192c40',
    activeRoom: '#214b5d',
    grid: '#263c51',
    gridMinor: '#172638',
    label: '#102134e8',
    ink: '#deebf4',
    ready: '#73dfcf',
    warning: '#f2b65e',
    danger: '#ee7979',
    unknown: '#8594a6',
    complete: '#8cafdf',
  },
  garden: {
    name: 'Garden Habitat',
    description: 'A sunlit conservatory with glass pods and ranger guides',
    background: '#e8eee6',
    floor: '#d7dac4',
    frame: '#57796b',
    room: '#d6e5cc',
    activeRoom: '#b8d9c2',
    grid: '#bdcfc0',
    gridMinor: '#d7e2d6',
    label: '#fffdf2ee',
    ink: '#284537',
    ready: '#16866a',
    warning: '#b77619',
    danger: '#c84c49',
    unknown: '#75818b',
    complete: '#3a6eac',
  },
  blueprint: {
    name: 'Blueprint Studio',
    description: 'A technical drafting studio with hex pods and robotic guides',
    background: '#e9f2fb',
    floor: '#c6d9ec',
    frame: '#356591',
    room: '#e0eaf5',
    activeRoom: '#b7dced',
    grid: '#a8c3dd',
    gridMinor: '#d0e1f1',
    label: '#f8fcffee',
    ink: '#173d61',
    ready: '#127a85',
    warning: '#a76a13',
    danger: '#c13b56',
    unknown: '#708497',
    complete: '#4061b0',
  },
  pearl: {
    name: 'Pearl Habitat',
    description: 'An airy pavilion with glass capsules and soft porcelain modules',
    background: '#f1f3f7',
    floor: '#dce4ef',
    frame: '#8099b6',
    room: '#e9edf4',
    activeRoom: '#cadff0',
    grid: '#dce3ec',
    gridMinor: '#e9edf3',
    label: '#fffffff0',
    ink: '#24354b',
    ready: '#128574',
    warning: '#aa6815',
    danger: '#cb405c',
    unknown: '#8291a5',
    complete: '#526bc0',
  },
  aurora: {
    name: 'Aurora Habitat',
    description: 'A luminous indigo atrium with orbital pods and playful astronaut guides',
    background: '#14162d',
    floor: '#22263f',
    frame: '#9c97d4',
    room: '#2d304a',
    activeRoom: '#3c4b69',
    grid: '#292d48',
    gridMinor: '#1b2037',
    label: '#20243eee',
    ink: '#edf0ff',
    ready: '#70ded0',
    warning: '#f2c16c',
    danger: '#fb8299',
    unknown: '#9198b1',
    complete: '#b2bafa',
  },
  slate: {
    name: 'Slate Habitat',
    description: 'A quiet charcoal campus with satin enclosures and tailored technical guides',
    background: '#1c232c',
    floor: '#2a3541',
    frame: '#91a7bb',
    room: '#34404e',
    activeRoom: '#3e596b',
    grid: '#303c49',
    gridMinor: '#252e38',
    label: '#252f3cf0',
    ink: '#e4edf5',
    ready: '#85d3bf',
    warning: '#e6bb74',
    danger: '#f58a91',
    unknown: '#93a0b0',
    complete: '#a0b6dc',
  },
} as const
const storageKey = 'kubehabitat:theme'
const isTheme = (value: unknown): value is ThemeId =>
  typeof value === 'string' && Object.hasOwn(themes, value)
export const ThemeContext = createContext<{ theme: ThemeId; setTheme: (theme: ThemeId) => void }>({
  theme: 'midnight',
  setTheme: () => {},
})
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return isTheme(saved) ? saved : 'midnight'
    } catch {
      return 'midnight'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(storageKey, theme)
    } catch {
      /* Theme remains usable when storage is disabled. */
    }
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)
export function ThemeSelector({ label = 'Theme' }: { label?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <label className="theme-selector">
      <span>{label}</span>
      <select
        aria-label={label}
        value={theme}
        onChange={(event) => {
          if (isTheme(event.target.value)) setTheme(event.target.value)
        }}
        title={themes[theme].description}
      >
        {Object.entries(themes).map(([id, item]) => (
          <option key={id} value={id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ResourceGlyph({ kind }: { kind: string }) {
  const { theme } = useTheme()
  if (theme === 'midnight')
    return (
      <>
        {kind === 'Node'
          ? '▣'
          : kind === 'Namespace'
            ? '◉'
            : kind === 'Pod'
              ? '⬡'
              : kind === 'Service'
                ? '♟'
                : '□'}
      </>
    )
  return (
    <svg
      className="theme-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap={theme === 'blueprint' ? 'square' : 'round'}
    >
      {kind === 'Service' ? (
        <>
          <circle cx="12" cy="5" r="3" />
          <path d="M6 21v-5a6 6 0 0 1 12 0v5M9 21v-5m6 5v-5M4 11l4 2m12-2-4 2" />
        </>
      ) : kind === 'Pod' ? (
        <>
          <path
            d={
              theme === 'garden' || theme === 'aurora'
                ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20'
                : theme === 'pearl' || theme === 'slate'
                  ? 'M8 2h8a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z'
                  : 'M12 2 22 8v8l-10 6-10-6V8Z'
            }
          />
          <rect
            x="8"
            y="8"
            width="8"
            height="8"
            rx={theme === 'garden' || isModernTheme(theme) ? 3 : 0}
          />
          {theme === 'aurora' && (
            <ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-25 12 12)" />
          )}
        </>
      ) : kind === 'Node' ? (
        <>
          <rect
            x="2"
            y="4"
            width="20"
            height="16"
            rx={theme === 'garden' || isModernTheme(theme) ? 5 : 0}
          />
          <path d="M8 4v16M2 12h20" />
        </>
      ) : kind === 'Container' && isModernTheme(theme) ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx={theme === 'slate' ? 2 : 5} />
          <path d="M8 9h8m-8 6h5" />
        </>
      ) : kind === 'Namespace' ? (
        <>
          <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M4 6c0-5 16-5 16 0v12c0 5-16 5-16 0Z" />
          <path d="M4 6c0 5 16 5 16 0M4 12c0 5 16 5 16 0" />
        </>
      )}
    </svg>
  )
}
