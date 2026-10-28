import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { GenerationResult } from '../../types'
import { buildZip, ZIP_ROOT } from './zipExport'

const results: GenerationResult[] = [
  {
    screenId: 'a',
    screenName: 'Login',
    framework: 'react',
    status: 'done',
    provider: 'mock',
    files: [
      { path: 'Login.tsx', language: 'tsx', kind: 'component', content: 'export default function Login() {}\n' },
      { path: 'login.mock.json', language: 'json', kind: 'mock-data', content: '{"ok":true}\n' },
    ],
  },
  {
    screenId: 'b',
    screenName: 'Login',
    framework: 'angular',
    status: 'done',
    files: [{ path: '../../etc/evil.ts', language: 'typescript', kind: 'other', content: 'x\n' }],
  },
  { screenId: 'c', screenName: 'Broken', framework: 'react', status: 'error', error: 'boom', files: [] },
]

describe('buildZip', () => {
  it('creates one folder per screen with README and manifest', async () => {
    const bytes = await buildZip(results).generateAsync({ type: 'uint8array' })
    const zip = await JSZip.loadAsync(bytes)
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort()

    expect(paths).toEqual(
      [
        `${ZIP_ROOT}/README.md`,
        `${ZIP_ROOT}/login/Login.tsx`,
        `${ZIP_ROOT}/login/login.mock.json`,
        `${ZIP_ROOT}/login-2/etc/evil.ts`,
        `${ZIP_ROOT}/manifest.json`,
      ].sort(),
    )
    expect(await zip.file(`${ZIP_ROOT}/login/Login.tsx`)!.async('string')).toContain('function Login')

    const manifest = JSON.parse(await zip.file(`${ZIP_ROOT}/manifest.json`)!.async('string'))
    expect(manifest.screens).toHaveLength(2)
    expect(manifest.screens[0]).toMatchObject({ name: 'Login', folder: 'login', framework: 'react' })

    const readme = await zip.file(`${ZIP_ROOT}/README.md`)!.async('string')
    expect(readme).toContain('### React')
    expect(readme).toContain('### Angular')
  })

  it('skips failed screens entirely', async () => {
    const zip = await JSZip.loadAsync(await buildZip([results[2]]).generateAsync({ type: 'uint8array' }))
    expect(Object.keys(zip.files).some((p) => p.includes('broken'))).toBe(false)
  })
})
