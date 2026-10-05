import type { CSSProperties } from 'react'
import { type Locale, resolveLocale } from '@/lib/i18n'

// Optional look and language chosen by the host page, from the /embed URL:
//   ?lang=fr&name=…&logo=https://…&primary=%23164642&accent=%23E9601F&…
// Every value is validated; anything missing or invalid keeps the default.

export const THEME_COLORS = ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'focus'] as const
export type ThemeColor = (typeof THEME_COLORS)[number]
export type Theme = Partial<Record<ThemeColor, string>>

export interface EmbedOptions {
  locale: Locale
  assistantName?: string
  logoUrl?: string
  theme: Theme
}

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const MAX_NAME_LENGTH = 60
const MAX_LOGO_URL_LENGTH = 2048

type SearchParams = Record<string, string | string[] | undefined>

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' ? value.trim() : undefined
}

export function parseColor(value: string | undefined): string | undefined {
  if (!value || !HEX_COLOR.test(value)) return undefined
  return value.startsWith('#') ? value : `#${value}`
}

/** https only (http for localhost while developing), so a logo can never be a script URL. */
export function parseLogoUrl(value: string | undefined): string | undefined {
  if (!value || value.length > MAX_LOGO_URL_LENGTH) return undefined
  try {
    const url = new URL(value)
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLocal) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function parseEmbedOptions(params: SearchParams): EmbedOptions {
  const name = single(params, 'name')
  const theme: Theme = {}
  for (const color of THEME_COLORS) {
    const value = parseColor(single(params, color))
    if (value) theme[color] = value
  }
  return {
    locale: resolveLocale(single(params, 'lang')),
    assistantName: name ? name.slice(0, MAX_NAME_LENGTH) : undefined,
    logoUrl: parseLogoUrl(single(params, 'logo')),
    theme,
  }
}

/** CSS custom properties overriding the defaults in globals.css (.assistant-theme). */
export function themeStyle(theme: Theme): CSSProperties {
  const style: Record<string, string> = {}
  for (const [color, value] of Object.entries(theme)) style[`--assistant-${color}`] = value
  return style as CSSProperties
}
