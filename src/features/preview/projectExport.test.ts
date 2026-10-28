import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { Branding, GenerationResult, Screen, TargetFramework } from '../../types'
import { detectScreens } from '../upload/detectScreens'
import { SAMPLE_DOCUMENT_TEXT } from '../upload/fixtures/sampleDesign'
import { FRAMEWORK_GENERATORS } from '../generate/generators'
import { FONT_CSS_VAR, toBrandingRefs } from '../generate/generators/branding'
import { buildProjectZip, isGenerationComplete, PROJECT_ROOTS } from './projectExport'
import { buildZip, ZIP_ROOT } from './zipExport'

const screens = detectScreens(SAMPLE_DOCUMENT_TEXT).slice(0, 3)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'
const branding: Branding = {
  fontFamily: 'Inter',
  logo: { dataUrl: `data:image/svg+xml;base64,${btoa(SVG)}`, fileName: 'brand.svg', mimeType: 'image/svg+xml' },
}

function generate(framework: TargetFramework, list: Screen[] = screens, brand: Branding = branding): GenerationResult[] {
  const refs = toBrandingRefs(brand)
  return list.map((s) => ({
    screenId: s.id,
    screenName: s.name,
    framework,
    status: 'done',
    provider: 'mock',
    files: FRAMEWORK_GENERATORS[framework].generateOffline(s, refs),
    branding: refs,
  }))
}

async function unzip(zip: JSZip) {
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))
  const paths = Object.keys(loaded.files)
    .filter((p) => !loaded.files[p].dir)
    .sort()
  const read = (p: string) => loaded.file(p)!.async('string')
  return { paths, read, loaded }
}

describe('buildProjectZip (React)', () => {
  const root = PROJECT_ROOTS.react

  it('assembles a runnable Vite + React + TypeScript project', async () => {
    const names = screens.map((s) => s.name)
    expect(names).toEqual(['Login', 'Dashboard', 'Customer List'])
    const { paths, read } = await unzip(buildProjectZip({ results: generate('react'), branding }))

    expect(paths).toEqual(
      [
        '.gitignore',
        'README.md',
        'index.html',
        'package.json',
        'src/App.css',
        'src/App.tsx',
        'src/assets/logo.svg',
        'src/main.tsx',
        'src/screens/CustomerList/CustomerList.module.css',
        'src/screens/CustomerList/CustomerList.tsx',
        'src/screens/CustomerList/customer-list.mock.json',
        'src/screens/CustomerList/useCustomerListData.ts',
        'src/screens/Dashboard/Dashboard.module.css',
        'src/screens/Dashboard/Dashboard.tsx',
        'src/screens/Dashboard/dashboard.mock.json',
        'src/screens/Dashboard/useDashboardData.ts',
        'src/screens/Login/Login.module.css',
        'src/screens/Login/Login.tsx',
        'src/screens/Login/login.mock.json',
        'src/screens/Login/useLoginData.ts',
        'src/theme.css',
        'tsconfig.json',
        'vite.config.ts',
      ]
        .map((p) => `${root}/${p}`)
        .sort(),
    )

    const pkg = JSON.parse(await read(`${root}/package.json`))
    expect(pkg.scripts).toMatchObject({ dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' })
    expect(Object.keys(pkg.dependencies)).toEqual(['react', 'react-dom'])
    expect(pkg.devDependencies).toHaveProperty('vite')
    expect(pkg.devDependencies).toHaveProperty('@vitejs/plugin-react')
    expect(pkg.devDependencies).toHaveProperty('typescript')

    const app = await read(`${root}/src/App.tsx`)
    expect(app).toContain("import Login from './screens/Login/Login'")
    expect(app).toContain("import CustomerList from './screens/CustomerList/CustomerList'")
    expect(app).toContain('{ path: "customer-list", title: "Customer List", component: CustomerList },')
    expect(app).toContain("import logoUrl from './assets/logo.svg'")

    expect(await read(`${root}/src/theme.css`)).toContain(`${FONT_CSS_VAR}: 'Inter',`)
    expect(await read(`${root}/src/main.tsx`)).toContain("import './theme.css'")
    expect(await read(`${root}/src/assets/logo.svg`)).toBe(SVG)
    expect(await read(`${root}/index.html`)).toContain('https://fonts.googleapis.com/css2?family=Inter')
    // Screen files keep the logo import that resolves to src/assets from src/screens/<Name>/.
    expect(await read(`${root}/src/screens/Login/Login.tsx`)).toContain("from '../../assets/logo.svg'")
    expect(JSON.parse(await read(`${root}/tsconfig.json`)).compilerOptions).toMatchObject({
      resolveJsonModule: true,
      types: ['vite/client'],
    })

    const readme = await read(`${root}/README.md`)
    expect(readme).toContain('npm install')
    expect(readme).toContain('npm run dev')
    expect(readme).toContain('npm run build')
    expect(readme).toContain('`#/customer-list`')
  })

  it('uses a logo placeholder and the system font without branding, and de-duplicates screens', async () => {
    const dup = { ...screens[0], id: 'dup' }
    const { paths, read } = await unzip(buildProjectZip({ results: generate('react', [screens[0], dup], {}) }))
    expect(paths.some((p) => p.includes('/assets/'))).toBe(false)
    expect(paths).toContain(`${root}/src/screens/Login2/Login.tsx`)

    const app = await read(`${root}/src/App.tsx`)
    expect(app).toContain("import Login2 from './screens/Login2/Login'")
    expect(app).toContain('{ path: "login-2", title: "Login", component: Login2 },')
    expect(app).toContain('app-logo-placeholder')
    expect(app).not.toContain('logoUrl')
    expect(await read(`${root}/src/theme.css`)).toContain(`${FONT_CSS_VAR}: system-ui`)
    expect(await read(`${root}/index.html`)).not.toContain('fonts.googleapis.com')
  })
})

describe('buildProjectZip (Angular)', () => {
  const root = PROJECT_ROOTS.angular

  it('assembles a runnable Angular CLI project', async () => {
    const { paths, read } = await unzip(buildProjectZip({ results: generate('angular'), branding }))
    for (const p of [
      'package.json',
      'angular.json',
      'tsconfig.json',
      'tsconfig.app.json',
      'README.md',
      'src/main.ts',
      'src/index.html',
      'src/styles.scss',
      'src/assets/logo.svg',
      'src/app/app.component.ts',
      'src/app/app.component.html',
      'src/app/app.config.ts',
      'src/app/app.routes.ts',
      'src/app/screens/login/login.component.ts',
      'src/app/screens/login/login.component.html',
      'src/app/screens/login/login.component.scss',
      'src/app/screens/login/login.service.ts',
      'src/app/screens/login/login.mock.json',
      'src/app/screens/customer-list/customer-list.component.ts',
    ]) {
      expect(paths).toContain(`${root}/${p}`)
    }
    expect(paths.filter((p) => p.includes('/src/app/screens/'))).toHaveLength(15)

    const pkg = JSON.parse(await read(`${root}/package.json`))
    expect(pkg.scripts).toMatchObject({ start: 'ng serve', build: 'ng build' })
    expect(pkg.dependencies).toHaveProperty('@angular/core')
    expect(pkg.dependencies).toHaveProperty('zone.js')
    expect(pkg.devDependencies).toHaveProperty('@angular/cli')
    expect(pkg.devDependencies).toHaveProperty('@angular/build')

    const angular = JSON.parse(await read(`${root}/angular.json`))
    const build = angular.projects[root].architect.build
    expect(build.builder).toBe('@angular/build:application')
    expect(build.options).toMatchObject({ browser: 'src/main.ts', styles: ['src/styles.scss'], polyfills: ['zone.js'] })
    expect(build.options.assets).toEqual([{ glob: '**/*', input: 'src/assets', output: 'assets' }])

    const routes = await read(`${root}/src/app/app.routes.ts`)
    expect(routes).toContain(
      `loadComponent: () => import('./screens/customer-list/customer-list.component').then((m) => m.CustomerListComponent),`,
    )
    expect(routes).toContain(`{ path: '', pathMatch: 'full', redirectTo: "login" },`)
    expect(await read(`${root}/src/app/app.component.ts`)).toContain('{ path: "dashboard", title: "Dashboard" },')
    expect(await read(`${root}/src/app/app.component.html`)).toContain('<img src="assets/logo.svg" alt="Logo" class="app-logo" />')
    expect(await read(`${root}/src/app/app.config.ts`)).toContain('provideHttpClient()')
    expect(await read(`${root}/src/styles.scss`)).toContain(`${FONT_CSS_VAR}: 'Inter',`)
    expect(await read(`${root}/src/assets/logo.svg`)).toBe(SVG)

    const readme = await read(`${root}/README.md`)
    expect(readme).toContain('npm install')
    expect(readme).toContain('npm start')
    expect(readme).toContain('npm run build')
  })

  it('keeps the assets folder and a placeholder without a logo', async () => {
    const arial: Branding = { fontFamily: 'Arial' }
    const { paths, read } = await unzip(buildProjectZip({ results: generate('angular', screens, arial), branding: arial }))
    expect(paths).toContain(`${root}/src/assets/.gitkeep`)
    expect(await read(`${root}/src/app/app.component.html`)).toContain('app-logo-placeholder')
    expect(await read(`${root}/src/styles.scss`)).toContain(`${FONT_CSS_VAR}: 'Arial',`)
    expect(await read(`${root}/src/index.html`)).not.toContain('fonts.googleapis.com')
  })
})

describe('buildProjectZip (general)', () => {
  it('creates one project per framework, skips failed screens and flags stale branding', async () => {
    const results = [
      ...generate('react', screens.slice(0, 1), {}),
      ...generate('angular', screens.slice(1, 2)),
      { screenId: 'x', screenName: 'Broken', framework: 'react' as const, status: 'error' as const, error: 'boom', files: [] },
    ]
    const { paths, read } = await unzip(buildProjectZip({ results, branding }))
    expect(paths.some((p) => p.startsWith(`${PROJECT_ROOTS.react}/`))).toBe(true)
    expect(paths.some((p) => p.startsWith(`${PROJECT_ROOTS.angular}/`))).toBe(true)
    expect(paths.some((p) => /broken/i.test(p))).toBe(false)
    expect(await read(`${PROJECT_ROOTS.react}/README.md`)).toContain('different branding')
    expect(await read(`${PROJECT_ROOTS.angular}/README.md`)).not.toContain('different branding')
  })

  it('refuses to export when nothing was generated', () => {
    expect(() => buildProjectZip({ results: [] })).toThrow(/no generated screens/)
  })
})

describe('isGenerationComplete', () => {
  const [a, b] = screens
  const done = (s: Screen): GenerationResult => ({ ...generate('react', [s])[0] })

  it('requires every screen to be done, ignoring skipped and cancelled ones', () => {
    expect(isGenerationComplete([a, b], { [a.id]: done(a), [b.id]: done(b) })).toBe(true)
    expect(isGenerationComplete([a, b], { [a.id]: done(a) })).toBe(false)
    expect(isGenerationComplete([a, b], { [a.id]: done(a), [b.id]: { ...done(b), status: 'generating', files: [] } })).toBe(false)
    expect(isGenerationComplete([a, b], { [a.id]: done(a), [b.id]: { ...done(b), status: 'error', error: 'boom' } })).toBe(false)
    expect(isGenerationComplete([a, b], { [a.id]: done(a), [b.id]: { ...done(b), status: 'error', error: 'Cancelled' } })).toBe(true)
    expect(
      isGenerationComplete([a, b], { [a.id]: done(a), [b.id]: { ...done(b), status: 'error', error: 'Skipped: screen removed' } }),
    ).toBe(true)
    expect(isGenerationComplete([a], { [a.id]: { ...done(a), status: 'error', error: 'Cancelled' } })).toBe(false)
    expect(isGenerationComplete([], {})).toBe(false)
  })
})

describe('buildZip with branding', () => {
  it('adds the theme and logo asset only when branding is set', async () => {
    const { paths, read } = await unzip(buildZip(generate('react', screens.slice(0, 1)), [], branding))
    expect(paths).toContain(`${ZIP_ROOT}/theme.css`)
    expect(paths).toContain(`${ZIP_ROOT}/assets/logo.svg`)
    expect(await read(`${ZIP_ROOT}/README.md`)).toContain('## Branding')

    const plain = await unzip(buildZip(generate('react', screens.slice(0, 1), {})))
    expect(plain.paths.some((p) => p.endsWith('theme.css') || p.includes('/assets/'))).toBe(false)
  })
})
