import { Check, ImageUp, Palette, Trash2, Type } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Badge, Button } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { FONT_SUGGESTIONS, fontStack, sanitizeFontFamily } from '../generate/generators/branding'
import { LOGO_ACCEPT, LOGO_PROMPT, readLogoFile } from './logoFile'

function fontMessage(confidence: 'high' | 'low' | 'none', detected?: string): string {
  if (confidence === 'high' && detected) return `We detected "${detected}" as the heading font. Confirm it or choose another font family.`
  if (confidence === 'low' && detected) {
    return `We found the font "${detected}" but couldn't confidently match it to a web font. Confirm it or specify the font family to use.`
  }
  return "We couldn't confidently detect a font family. Specify the one to use (e.g. Inter, Roboto, Open Sans), or leave it empty for the system font."
}

/**
 * Branding confirmation: lets the user supply the logo and confirm the font family that
 * every generated screen (and the exported project) will use.
 */
export function BrandingCard() {
  const { brandingDetection, branding, setBranding } = useAppStore()
  const detection = brandingDetection ?? { logoDetected: false, fontConfidence: 'none' as const }
  const [draft, setDraft] = useState(() => branding.fontFamily ?? detection.fontFamily ?? '')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = useId()

  const candidate = detection.logoCandidate
  const usingCandidate = !!candidate && branding.logo?.dataUrl === candidate.dataUrl
  const cleanDraft = sanitizeFontFamily(draft)
  const fontConfirmed = !!branding.fontFamily && cleanDraft === branding.fontFamily

  const onLogoFile = async (file: File) => {
    setError(null)
    try {
      setBranding({ logo: await readLogoFile(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="card mb-6 p-5" aria-labelledby={`${ids}-title`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Palette className="size-5 text-brand-600 dark:text-brand-300" aria-hidden />
        <h2 id={`${ids}-title`} className="text-base font-semibold">
          Branding
        </h2>
        {detection.sourceFile && <Badge>from {detection.sourceFile}</Badge>}
        <p className="w-full text-sm text-slate-500 dark:text-slate-400">
          Applied consistently to every generated screen and to the exported project.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ImageUp className="size-4" aria-hidden /> Logo
            {detection.logoDetected && <Badge tone="brand">Logo detected</Badge>}
          </h3>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            {detection.logoDetected
              ? LOGO_PROMPT
              : 'No logo was detected. You can still upload one (optional); otherwise a placeholder is rendered.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-14 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {branding.logo ? (
                <img src={branding.logo.dataUrl} alt="Selected logo preview" className="max-h-12 max-w-24 object-contain" />
              ) : (
                <span className="text-[10px] tracking-widest text-slate-400">LOGO</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<ImageUp className="size-3.5" />} onClick={() => fileRef.current?.click()}>
                {branding.logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {candidate && !usingCandidate && (
                <Button size="sm" variant="ghost" onClick={() => setBranding({ logo: candidate })}>
                  Use detected image
                </Button>
              )}
              {branding.logo && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => setBranding({ logo: undefined })}
                >
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              aria-label="Upload logo image (png, svg or jpg)"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onLogoFile(file)
                e.target.value = ''
              }}
            />
          </div>
          {branding.logo && (
            <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
              {usingCandidate ? 'Using the image extracted from the document' : branding.logo.fileName}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Type className="size-4" aria-hidden /> Font family
            {detection.fontConfidence === 'high' && <Badge tone="brand">Detected</Badge>}
            {detection.fontConfidence === 'low' && <Badge tone="warning">Please confirm</Badge>}
          </h3>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            {fontMessage(detection.fontConfidence, detection.fontFamily)}
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setBranding({ fontFamily: cleanDraft })
              setDraft(cleanDraft ?? '')
            }}
          >
            <label htmlFor={`${ids}-font`} className="sr-only">
              Font family
            </label>
            <input
              id={`${ids}-font`}
              className="input h-8 min-w-0 flex-1"
              list={`${ids}-fonts`}
              placeholder="e.g. Inter, Roboto, Open Sans"
              value={draft}
              maxLength={64}
              onChange={(e) => setDraft(e.target.value)}
            />
            <datalist id={`${ids}-fonts`}>
              {FONT_SUGGESTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <Button type="submit" size="sm" variant={fontConfirmed ? 'secondary' : 'primary'} icon={<Check className="size-3.5" />}>
              {cleanDraft ? 'Use this font' : 'Use system font'}
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {branding.fontFamily ? (
              <>
                Confirmed: <strong>{branding.fontFamily}</strong>
              </>
            ) : (
              'Not set — generated screens use the system font stack.'
            )}
          </p>
          <p className="mt-2 truncate text-lg" style={{ fontFamily: fontStack(draft) }}>
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      </div>
    </section>
  )
}
