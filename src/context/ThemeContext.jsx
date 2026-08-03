import { createContext, useContext, useState, useMemo } from 'react'
import { guardarPreferencia } from '../auth'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  // El tema inicial sale de localStorage (que se sincroniza con la cuenta al iniciar sesión)
  const [dark, setDark]           = useState(() => { try { return localStorage.getItem('tema') === 'dark' } catch { return false } })
  const [sidebarOpen, setSidebar] = useState(true)
  const toggle = () => setDark(d => {
    const n = !d
    try { localStorage.setItem('tema', n ? 'dark' : 'light') } catch { /* noop */ }
    guardarPreferencia('tema', n ? 'dark' : 'light')   // persiste en la cuenta (Supabase)
    return n
  })
  const toggleSidebar = () => setSidebar(o => !o)
  const t = useMemo(() => tokens(dark), [dark])
  return (
    <ThemeContext.Provider value={{ dark, toggle, t, sidebarOpen, toggleSidebar }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

// Tokens por modo
export function tokens(dark) {
  if (dark) {
    return {
      bg:           'linear-gradient(145deg, #111113 0%, #1c1c1e 50%, #222224 100%)',
      cardBg:       'rgba(255,255,255,0.07)',
      cardBorder:   'rgba(255,255,255,0.12)',
      cardBlur:     'blur(16px)',
      sidebarBg:    'rgba(255,255,255,0.06)',
      sidebarBorder:'rgba(255,255,255,0.1)',
      navActive:    'rgba(255,255,255,0.14)',
      navActiveBorder:'rgba(255,255,255,0.2)',
      navHover:     'rgba(255,255,255,0.07)',
      navHoverBorder:'rgba(255,255,255,0.1)',
      userChip:     'rgba(255,255,255,0.08)',
      userChipBorder:'rgba(255,255,255,0.13)',
      divider:      'rgba(255,255,255,0.09)',
      text1:        '#ffffff',
      text2:        'rgba(255,255,255,0.7)',
      text3:        'rgba(255,255,255,0.4)',
      text4:        'rgba(255,255,255,0.25)',
      iconBox:      'rgba(255,255,255,0.1)',
      iconBoxBorder:'rgba(255,255,255,0.15)',
      badgeBg:      'rgba(255,255,255,0.1)',
      badgeBorder:  'rgba(255,255,255,0.15)',
      badgeText:    'rgba(255,255,255,0.7)',
      barTrack:     'rgba(255,255,255,0.08)',
      barFill:      'rgba(255,255,255,0.3)',
      barFillActive:'rgba(255,255,255,0.7)',
      rowDivider:   'rgba(255,255,255,0.06)',
      inputBg:      'rgba(255,255,255,0.07)',
      inputBorder:  'rgba(255,255,255,0.14)',
      btnBg:        'rgba(255,255,255,0.15)',
      btnBorder:    'rgba(255,255,255,0.25)',
      toggleBg:     'rgba(255,255,255,0.1)',
      toggleBorder: 'rgba(255,255,255,0.18)',
      colorGreen:   '#7ee8a2',
      colorRed:     '#f4a1a1',
      colorYellow:  '#ffd580',
      colorBlue:    '#a8c5f8',
    }
  }
  return {
    bg:           'linear-gradient(145deg, #e8e8ea 0%, #efefef 50%, #e4e4e6 100%)',
    cardBg:       'rgba(255,255,255,0.72)',
    cardBorder:   'rgba(0,0,0,0.1)',
    cardBlur:     'blur(20px)',
    sidebarBg:    'rgba(255,255,255,0.65)',
    sidebarBorder:'rgba(0,0,0,0.1)',
    navActive:    'rgba(0,0,0,0.08)',
    navActiveBorder:'rgba(0,0,0,0.14)',
    navHover:     'rgba(0,0,0,0.04)',
    navHoverBorder:'rgba(0,0,0,0.07)',
    userChip:     'rgba(0,0,0,0.05)',
    userChipBorder:'rgba(0,0,0,0.1)',
    divider:      'rgba(0,0,0,0.08)',
    text1:        '#111111',
    text2:        '#333333',
    text3:        '#777777',
    text4:        '#aaaaaa',
    iconBox:      'rgba(0,0,0,0.06)',
    iconBoxBorder:'rgba(0,0,0,0.1)',
    badgeBg:      'rgba(0,0,0,0.06)',
    badgeBorder:  'rgba(0,0,0,0.12)',
    badgeText:    '#444444',
    barTrack:     'rgba(0,0,0,0.08)',
    barFill:      'rgba(0,0,0,0.25)',
    barFillActive:'rgba(0,0,0,0.7)',
    rowDivider:   'rgba(0,0,0,0.06)',
    inputBg:      'rgba(0,0,0,0.04)',
    inputBorder:  'rgba(0,0,0,0.12)',
    btnBg:        'rgba(0,0,0,0.08)',
    btnBorder:    'rgba(0,0,0,0.16)',
    toggleBg:     'rgba(0,0,0,0.07)',
    toggleBorder: 'rgba(0,0,0,0.14)',
    colorGreen:   '#16a34a',
    colorRed:     '#dc2626',
    colorYellow:  '#d97706',
    colorBlue:    '#2563eb',
  }
}
