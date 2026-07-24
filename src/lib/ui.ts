import type { ColourBand, LetterGrade } from '../types'

export function gradeInkClass(grade: LetterGrade | null): string {
  if (grade === 'D' || grade === 'F') return 'text-shame'
  if (grade === 'A' || grade === 'B') return 'text-good'
  return 'text-ink'
}

export function colourBandClasses(band: ColourBand | null): string {
  if (band === 'green') return 'border-good/25 bg-emerald-50 text-good'
  if (band === 'yellow') return 'border-warn/25 bg-amber-50 text-warn'
  if (band === 'red') return 'border-shame/25 bg-shame-soft text-shame'
  return 'border-line bg-canvas text-ink-muted'
}

export async function shareBuilding(opts: {
  title: string
  text: string
  url: string
}): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(opts)
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
    }
  }

  await navigator.clipboard.writeText(`${opts.text}\n${opts.url}`)
  return 'copied'
}
