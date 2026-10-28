import JSZip from 'jszip'
import type { Branding, BrandingRefs, GeneratedFile, GenerationResult, Screen, TargetFramework } from '../../types'
import { toKebabCase, toPascalCase } from '../../utils/strings'
import { sanitizePath } from '../generate/fileFormat'
import { angularLogoUrl } from '../generate/generators/angular'
import {
  buildThemeCss,
  dataUrlToBytes,
  FONT_CSS_VAR,
  googleFontsHref,
  LOGO_PLACEHOLDER_TEXT,
  sameBrandingRefs,
  toBrandingRefs,
} from '../generate/generators/branding'
import { getGenerator } from '../generate/generators'

/** Root folder of the exported, runnable project per framework. */
export const PROJECT_ROOTS: Record<TargetFramework, string> = {
  react: 'ui-coding-agent-react-app',
  angular: 'ui-coding-agent-angular-app',
}

export const PROJECT_ZIP_NAME = 'ui-coding-agent-project.zip'
const APP_TITLE = 'Generated UI'

/** Pinned scaffold dependencies (Node.js ^20.19 || >=22.12, same as this app). */
export const REACT_PROJECT_DEPENDENCIES = {
  dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
  devDependencies: {
    '@types/react': '^18.3.31',
    '@types/react-dom': '^18.3.7',
    '@vitejs/plugin-react': '^6.1.2',
    typescript: '~5.9.3',
    vite: '^8.3.5',
  },
}

const ANGULAR_VERSION = '^21.2.0'
export const ANGULAR_PROJECT_DEPENDENCIES = {
  dependencies: {
    '@angular/common': ANGULAR_VERSION,
    '@angular/compiler': ANGULAR_VERSION,
    '@angular/core': ANGULAR_VERSION,
    '@angular/forms': ANGULAR_VERSION,
    '@angular/platform-browser': ANGULAR_VERSION,
    '@angular/router': ANGULAR_VERSION,
    rxjs: '~7.8.0',
    tslib: '^2.8.0',
    'zone.js': '~0.16.0',
  },
  devDependencies: {
    '@angular/build': ANGULAR_VERSION,
    '@angular/cli': ANGULAR_VERSION,
    '@angular/compiler-cli': ANGULAR_VERSION,
    typescript: '~5.9.3',
  },
}

function isSkipped(result: GenerationResult): boolean {
  return result.status === 'error' && (result.error === 'Cancelled' || !!result.error?.startsWith('Skipped'))
}

/**
 * True once every screen has finished generating successfully. Skipped/cancelled
 * screens are ignored; any other failure, a missing result or a running screen
 * means generation is not complete. At least one screen must be done.
 */
export function isGenerationComplete(screens: Screen[], results: Record<string, GenerationResult>): boolean {
  let done = 0
  for (const screen of screens) {
    const result = results[screen.id]
    if (!result) return false
    if (isSkipped(result)) continue
    if (result.status !== 'done' || result.files.length === 0) return false
    done++
  }
  return done > 0
}

interface ProjectScreen {
  result: GenerationResult
  title: string
  /** Folder under the screens directory (PascalCase for React, kebab-case for Angular). */
  folder: string
  /** Route path, e.g. "customer-list". */
  route: string
  /** Unique identifier for imports (React) / exported component class (Angular). */
  symbol: string
  /** Import path of the entry component, relative to the screens directory, without extension. */
  entry?: string
}

function unique(base: string, used: Set<string>, join: (base: string, n: number) => string): string {
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = join(base, i)
  used.add(name.toLowerCase())
  return name
}

function files(result: GenerationResult): Array<GeneratedFile & { path: string }> {
  return result.files.map((f) => ({ ...f, path: sanitizePath(f.path) })).filter((f) => f.path)
}

function planScreens(results: GenerationResult[], framework: TargetFramework): ProjectScreen[] {
  const folders = new Set<string>()
  const routes = new Set<string>()
  const symbols = new Set<string>()
  return results.map((result) => {
    const pascal = toPascalCase(result.screenName)
    const kebab = toKebabCase(result.screenName)
    const route = unique(kebab, routes, (b, n) => `${b}-${n}`)
    if (framework === 'react') {
      const component = files(result).find((f) => f.kind === 'component' && /\.[jt]sx$/.test(f.path))
      return {
        result,
        title: result.screenName,
        folder: unique(pascal, folders, (b, n) => `${b}${n}`),
        route,
        symbol: unique(pascal, symbols, (b, n) => `${b}${n}`),
        entry: component?.path.replace(/\.[jt]sx$/, ''),
      }
    }
    const component = files(result).find((f) => /\.component\.ts$/.test(f.path))
    const className = component?.content.match(/export\s+class\s+([A-Za-z_$][\w$]*)/)?.[1]
    return {
      result,
      title: result.screenName,
      folder: unique(kebab, folders, (b, n) => `${b}-${n}`),
      route,
      symbol: className ?? `${pascal}Component`,
      entry: component?.path.replace(/\.ts$/, ''),
    }
  })
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const str = (value: string) => JSON.stringify(value)

function indexHtml(title: string, branding: BrandingRefs, body: string, extraHead = ''): string {
  const font = googleFontsHref(branding.fontFamily)
  const fontLinks = font
    ? `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${font}" />`
    : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />${extraHead}
    <title>${title}</title>${fontLinks}
  </head>
  <body>
    ${body}
  </body>
</html>
`
}

function brandingReadme(branding: BrandingRefs, themeFile: string, assetsDir: string): string {
  const font = branding.fontFamily
    ? `- **Font family:** \`${branding.fontFamily}\` — defined once as the \`${FONT_CSS_VAR}\` CSS variable in \`${themeFile}\`${googleFontsHref(branding.fontFamily) ? ' (loaded from Google Fonts in `index.html`)' : ''}. Every screen uses \`font-family: var(${FONT_CSS_VAR}, …)\`.`
    : `- **Font family:** system font stack — change \`${FONT_CSS_VAR}\` in \`${themeFile}\` to apply a brand font everywhere.`
  const logo = branding.logoAsset
    ? `- **Logo:** \`${assetsDir}/${branding.logoAsset}\`, shown in the app header and at the top of every screen.`
    : `- **Logo:** none provided — a "${LOGO_PLACEHOLDER_TEXT}" placeholder is shown. Add your logo to \`${assetsDir}/\` and reference it in the header.`
  return `${font}\n${logo}`
}

function screensTable(screens: ProjectScreen[], dir: string, routePrefix: string): string {
  return screens
    .map((s) => `| ${s.title.replace(/[\\|]/g, '\\$&')} | \`${routePrefix}${s.route}\` | \`${dir}/${s.folder}/\` |`)
    .join('\n')
}

function warnings(screens: ProjectScreen[], mismatched: boolean): string {
  const notes: string[] = []
  const unrouted = screens.filter((s) => !s.entry)
  if (unrouted.length) {
    notes.push(
      `- No entry component was found for: ${unrouted.map((s) => s.title).join(', ')}. Their files are included but not routed.`,
    )
  }
  if (mismatched) {
    notes.push(
      '- Some screens were generated with different branding than the current settings. Regenerate them in UI Coding Agent for a consistent look.',
    )
  }
  return notes.length ? `\n## Notes\n\n${notes.join('\n')}\n` : ''
}

function writeScreenFiles(root: JSZip, dir: string, screens: ProjectScreen[]) {
  for (const s of screens) {
    for (const f of files(s.result)) root.file(`${dir}/${s.folder}/${f.path}`, f.content)
  }
}

function writeLogo(root: JSZip, assetsDir: string, branding: Branding, refs: BrandingRefs) {
  if (branding.logo && refs.logoAsset) root.file(`${assetsDir}/${refs.logoAsset}`, dataUrlToBytes(branding.logo.dataUrl))
}

// ---------------------------------------------------------------------------
// React (Vite + TypeScript)
// ---------------------------------------------------------------------------

function reactAppSource(screens: ProjectScreen[], refs: BrandingRefs): string {
  const routed = screens.filter((s) => s.entry)
  const imports = routed.map((s) => `import ${s.symbol} from './screens/${s.folder}/${s.entry}'`).join('\n')
  const entries = routed
    .map((s) => `  { path: ${str(s.route)}, title: ${str(s.title)}, component: ${s.symbol} },`)
    .join('\n')
  const logoImport = refs.logoAsset ? `import logoUrl from './assets/${refs.logoAsset}'\n` : ''
  const brand = refs.logoAsset
    ? `<img src={logoUrl} alt="Logo" className="app-logo" />`
    : `<span className="app-logo-placeholder" aria-hidden="true">${LOGO_PLACEHOLDER_TEXT}</span>`
  return `import { useEffect, useState, type ComponentType } from 'react'
${logoImport}${imports}

interface ScreenRoute {
  path: string
  title: string
  component: ComponentType
}

/** Screens generated by UI Coding Agent. Routing uses the URL hash (#/screen-name). */
const SCREENS: ScreenRoute[] = [
${entries}
]

function currentPath(): string {
  return window.location.hash.replace(/^#\\/?/, '')
}

export default function App() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onHashChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const active = SCREENS.find((s) => s.path === path) ?? SCREENS[0]
  const Screen = active?.component

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-brand" href={\`#/\${SCREENS[0]?.path ?? ''}\`}>
          ${brand}
          <span>${APP_TITLE}</span>
        </a>
        <nav aria-label="Screens">
          <ul className="app-nav">
            {SCREENS.map((screen) => (
              <li key={screen.path}>
                <a href={\`#/\${screen.path}\`} aria-current={screen === active ? 'page' : undefined}>
                  {screen.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="app-main">{Screen ? <Screen /> : <p>No screens were generated.</p>}</main>
    </div>
  )
}
`
}

const SHELL_STYLES = `.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 2rem;
  padding: 0.75rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  color: inherit;
  font-weight: 700;
  text-decoration: none;
}

.app-logo {
  display: block;
  height: 32px;
  width: auto;
  max-width: 160px;
  object-fit: contain;
}

.app-logo-placeholder {
  display: inline-grid;
  place-items: center;
  height: 32px;
  padding: 0 0.6rem;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #64748b;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
}

.app-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-nav a {
  display: block;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  color: #475569;
  font-size: 0.9rem;
  text-decoration: none;
}

.app-nav a:hover {
  background: #f1f5f9;
}

.app-nav a[aria-current='page'],
.app-nav a.active {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
`

function reactReadme(screens: ProjectScreen[], refs: BrandingRefs, mismatched: boolean): string {
  return `# ${APP_TITLE} — React + Vite + TypeScript

Generated by **UI Coding Agent**: ${screens.length} screen${screens.length === 1 ? '' : 's'} wired into a runnable Vite app.
Each screen loads its data through a mock API layer that resolves a dummy JSON response after a simulated delay.

## Requirements

- Node.js **20.19+** or **22.12+** and npm

## Run locally

\`\`\`bash
npm install
npm run dev        # starts the dev server on http://localhost:5173
\`\`\`

## Build for production

\`\`\`bash
npm run build      # type-checks (tsc) and bundles into dist/
npm run preview    # serves the production build locally
\`\`\`

## Screens

Navigate between screens with the header links (hash routes).

| Screen | Route | Folder |
| --- | --- | --- |
${screensTable(screens, 'src/screens', '#/')}

## Branding

${brandingReadme(refs, 'src/theme.css', 'src/assets')}

## Project structure

\`\`\`text
index.html            # HTML entry (loads the brand font when it is a Google Font)
vite.config.ts
tsconfig.json
src/
  main.tsx            # React entry; imports the global theme
  App.tsx             # app shell: header, logo, navigation, hash routing
  App.css             # app shell styles
  theme.css           # global theme (${FONT_CSS_VAR})
  assets/             # logo
  screens/<Screen>/   # one folder per generated screen (component, CSS module, API hook, mock JSON)
\`\`\`

## Switching to a real API

Each \`screens/<Screen>/use<Screen>Data.ts\` exports an endpoint constant and a \`USE_MOCK\` flag. Set it to
\`false\` to call the real endpoint with \`fetch\`.
${warnings(screens, mismatched)}`
}

function addReactProject(root: JSZip, results: GenerationResult[], branding: Branding, refs: BrandingRefs, mismatched: boolean) {
  const screens = planScreens(results, 'react')
  root.file(
    'package.json',
    json({
      name: PROJECT_ROOTS.react,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview', typecheck: 'tsc --noEmit' },
      ...REACT_PROJECT_DEPENDENCIES,
      engines: { node: '^20.19.0 || >=22.12.0' },
    }),
  )
  root.file(
    'vite.config.ts',
    `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
`,
  )
  root.file(
    'tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        types: ['vite/client'],
        jsx: 'react-jsx',
        strict: true,
        resolveJsonModule: true,
        isolatedModules: true,
        moduleDetection: 'force',
        skipLibCheck: true,
        noEmit: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ['src', 'vite.config.ts'],
    }),
  )
  root.file('index.html', indexHtml(APP_TITLE, refs, `<div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>`))
  root.file(
    'src/main.tsx',
    `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './theme.css'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
  )
  root.file('src/App.tsx', reactAppSource(screens, refs))
  root.file('src/App.css', SHELL_STYLES)
  root.file('src/theme.css', buildThemeCss(refs))
  writeLogo(root, 'src/assets', branding, refs)
  writeScreenFiles(root, 'src/screens', screens)
  root.file('.gitignore', 'node_modules\ndist\n*.local\n')
  root.file('README.md', reactReadme(screens, refs, mismatched))
}

// ---------------------------------------------------------------------------
// Angular (CLI-style, standalone components)
// ---------------------------------------------------------------------------

function angularRoutesSource(screens: ProjectScreen[]): string {
  const routed = screens.filter((s) => s.entry)
  const entries = routed.map(
    (s) =>
      `  {\n    path: ${str(s.route)},\n    title: ${str(s.title)},\n    loadComponent: () => import('./screens/${s.folder}/${s.entry}').then((m) => m.${s.symbol}),\n  },`,
  )
  if (routed.length) {
    entries.push(`  { path: '', pathMatch: 'full', redirectTo: ${str(routed[0].route)} },`)
    entries.push(`  { path: '**', redirectTo: ${str(routed[0].route)} },`)
  }
  return `import type { Routes } from '@angular/router'

/** One lazy-loaded route per screen generated by UI Coding Agent. */
export const routes: Routes = [
${entries.join('\n')}
]
`
}

function angularAppComponent(screens: ProjectScreen[]): string {
  const links = screens
    .filter((s) => s.entry)
    .map((s) => `    { path: ${str(s.route)}, title: ${str(s.title)} },`)
    .join('\n')
  return `import { Component } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'

export interface ScreenLink {
  path: string
  title: string
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  readonly title = ${str(APP_TITLE)}
  readonly screens: ScreenLink[] = [
${links}
  ]
}
`
}

function angularAppTemplate(refs: BrandingRefs): string {
  const brand = refs.logoAsset
    ? `<img src="${angularLogoUrl(refs.logoAsset)}" alt="Logo" class="app-logo" />`
    : `<span class="app-logo-placeholder" aria-hidden="true">${LOGO_PLACEHOLDER_TEXT}</span>`
  return `<header class="app-header">
  <a class="app-brand" routerLink="/">
    ${brand}
    <span>{{ title }}</span>
  </a>
  <nav aria-label="Screens">
    <ul class="app-nav">
      @for (screen of screens; track screen.path) {
        <li>
          <a [routerLink]="screen.path" routerLinkActive="active" ariaCurrentWhenActive="page">{{ screen.title }}</a>
        </li>
      }
    </ul>
  </nav>
</header>

<main class="app-main">
  <router-outlet />
</main>
`
}

function angularReadme(screens: ProjectScreen[], refs: BrandingRefs, mismatched: boolean): string {
  return `# ${APP_TITLE} — Angular

Generated by **UI Coding Agent**: ${screens.length} standalone screen component${screens.length === 1 ? '' : 's'} wired into a
runnable Angular CLI app. Each screen loads its data through an injectable service that returns a dummy JSON
response after a simulated delay.

## Requirements

- Node.js **20.19+**, **22.12+** or **24+** and npm
- The Angular CLI is installed locally as a dev dependency (\`npx ng …\`); a global install is optional.

## Run locally

\`\`\`bash
npm install
npm start          # runs "ng serve" on http://localhost:4200
\`\`\`

> If \`npm install\` fails with \`Cannot read properties of null (reading 'edgesOut')\`, your npm 10.x client hit a
> known dependency-resolution bug: upgrade npm (\`npm install -g npm@latest\`) or run \`npx npm@11 install\`.

## Build for production

\`\`\`bash
npm run build      # runs "ng build", output in dist/
\`\`\`

## Screens

| Screen | Route | Folder |
| --- | --- | --- |
${screensTable(screens, 'src/app/screens', '/')}

## Branding

${brandingReadme(refs, 'src/styles.scss', 'src/assets')}

## Project structure

\`\`\`text
angular.json, tsconfig.json, tsconfig.app.json
src/
  index.html                  # HTML entry (loads the brand font when it is a Google Font)
  main.ts                     # bootstraps AppComponent with app.config.ts
  styles.scss                 # global theme (${FONT_CSS_VAR})
  assets/                     # logo (served at /assets)
  app/
    app.component.*           # app shell: header, logo, navigation, <router-outlet>
    app.config.ts             # provideRouter + provideHttpClient
    app.routes.ts             # one lazy route per screen
    screens/<screen-name>/    # component (.ts/.html/.scss), service, mock JSON
\`\`\`

## Switching to a real API

Each \`screens/<screen-name>/<screen-name>.service.ts\` has a \`useMock\` flag. Set it to \`false\` to call the
real endpoint with \`HttpClient\`.
${warnings(screens, mismatched)}`
}

function addAngularProject(root: JSZip, results: GenerationResult[], branding: Branding, refs: BrandingRefs, mismatched: boolean) {
  const screens = planScreens(results, 'angular')
  const name = PROJECT_ROOTS.angular
  root.file(
    'package.json',
    json({
      name,
      version: '0.1.0',
      private: true,
      scripts: {
        ng: 'ng',
        start: 'ng serve',
        build: 'ng build',
        watch: 'ng build --watch --configuration development',
      },
      ...ANGULAR_PROJECT_DEPENDENCIES,
      engines: { node: '^20.19.0 || ^22.12.0 || >=24.0.0' },
    }),
  )
  root.file(
    'angular.json',
    json({
      $schema: './node_modules/@angular/cli/lib/config/schema.json',
      version: 1,
      cli: { analytics: false },
      newProjectRoot: 'projects',
      projects: {
        [name]: {
          projectType: 'application',
          schematics: { '@schematics/angular:component': { style: 'scss' } },
          root: '',
          sourceRoot: 'src',
          prefix: 'app',
          architect: {
            build: {
              builder: '@angular/build:application',
              options: {
                outputPath: `dist/${name}`,
                index: 'src/index.html',
                browser: 'src/main.ts',
                polyfills: ['zone.js'],
                tsConfig: 'tsconfig.app.json',
                inlineStyleLanguage: 'scss',
                assets: [{ glob: '**/*', input: 'src/assets', output: 'assets' }],
                styles: ['src/styles.scss'],
              },
              configurations: {
                production: {
                  budgets: [
                    { type: 'initial', maximumWarning: '1mb', maximumError: '2mb' },
                    { type: 'anyComponentStyle', maximumWarning: '16kb', maximumError: '32kb' },
                  ],
                  outputHashing: 'all',
                  // Fonts load at runtime via <link>; build-time inlining would need network access.
                  optimization: { scripts: true, styles: { minify: true, inlineCritical: true }, fonts: false },
                },
                development: { optimization: false, extractLicenses: false, sourceMap: true },
              },
              defaultConfiguration: 'production',
            },
            serve: {
              builder: '@angular/build:dev-server',
              configurations: {
                production: { buildTarget: `${name}:build:production` },
                development: { buildTarget: `${name}:build:development` },
              },
              defaultConfiguration: 'development',
            },
          },
        },
      },
    }),
  )
  root.file(
    'tsconfig.json',
    json({
      compileOnSave: false,
      compilerOptions: {
        outDir: './dist/out-tsc',
        strict: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        skipLibCheck: true,
        isolatedModules: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        importHelpers: true,
        moduleResolution: 'bundler',
        target: 'ES2022',
        module: 'ES2022',
        lib: ['ES2022', 'DOM'],
      },
      angularCompilerOptions: {
        enableI18nLegacyMessageIdFormat: false,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        strictTemplates: true,
      },
    }),
  )
  root.file(
    'tsconfig.app.json',
    json({
      extends: './tsconfig.json',
      compilerOptions: { outDir: './out-tsc/app', types: [] },
      files: ['src/main.ts'],
      include: ['src/**/*.d.ts'],
    }),
  )
  root.file('src/index.html', indexHtml(APP_TITLE, refs, '<app-root></app-root>', '\n    <base href="/" />'))
  root.file(
    'src/main.ts',
    `import { bootstrapApplication } from '@angular/platform-browser'
import { AppComponent } from './app/app.component'
import { appConfig } from './app/app.config'

bootstrapApplication(AppComponent, appConfig).catch((err: unknown) => console.error(err))
`,
  )
  root.file(
    'src/app/app.config.ts',
    `import { provideHttpClient } from '@angular/common/http'
import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideHttpClient()],
}
`,
  )
  root.file('src/app/app.routes.ts', angularRoutesSource(screens))
  root.file('src/app/app.component.ts', angularAppComponent(screens))
  root.file('src/app/app.component.html', angularAppTemplate(refs))
  root.file('src/app/app.component.scss', `:host {\n  display: block;\n}\n\n${SHELL_STYLES}`)
  root.file('src/styles.scss', buildThemeCss(refs))
  if (refs.logoAsset) writeLogo(root, 'src/assets', branding, refs)
  else root.file('src/assets/.gitkeep', '')
  writeScreenFiles(root, 'src/app/screens', screens)
  root.file('.gitignore', 'node_modules\ndist\n.angular\n')
  root.file('README.md', angularReadme(screens, refs, mismatched))
}

// ---------------------------------------------------------------------------

export interface ProjectExportOptions {
  results: GenerationResult[]
  branding?: Branding
}

/**
 * Build a ZIP with a complete, runnable project per target framework present in the
 * results (normally one): `ui-coding-agent-react-app/` and/or `ui-coding-agent-angular-app/`.
 * Only successfully generated screens are included.
 */
export function buildProjectZip({ results, branding = {} }: ProjectExportOptions): JSZip {
  const done = results.filter((r) => r.status === 'done' && r.files.length > 0)
  if (done.length === 0) throw new Error('There are no generated screens to export.')
  const refs = toBrandingRefs(branding)
  const zip = new JSZip()
  const frameworks = [...new Set(done.map((r) => r.framework))]
  for (const framework of frameworks) {
    getGenerator(framework) // throws for unknown frameworks
    const group = done.filter((r) => r.framework === framework)
    const mismatched = group.some((r) => !sameBrandingRefs(r.branding, refs))
    const root = zip.folder(PROJECT_ROOTS[framework])!
    if (framework === 'react') addReactProject(root, group, branding, refs, mismatched)
    else addAngularProject(root, group, branding, refs, mismatched)
  }
  return zip
}

/** Generate the full-project ZIP as a Blob and trigger a browser download. */
export async function downloadProjectZip(options: ProjectExportOptions, fileName = PROJECT_ZIP_NAME): Promise<void> {
  const { saveAs } = await import('file-saver')
  const blob = await buildProjectZip(options).generateAsync({ type: 'blob', compression: 'DEFLATE' })
  saveAs(blob, fileName)
}
