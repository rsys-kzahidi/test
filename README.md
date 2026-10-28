# UI Coding Agent

Turn UI design documents (PDF or Word) into working front-end code.

Upload a design spec, review the screens the agent extracts, pick an LLM (OpenAI, Anthropic Claude, or a
locally hosted model such as Ollama / LM Studio), and generate — per screen — an **Angular or React component,
its styles, a dummy JSON API response and a mock API service/hook** wired to that data. Preview everything with
syntax highlighting and download it as a ZIP.

An **offline demo provider** and a **sample design document** are built in, so the whole flow works without
any API keys or network access.

---

## Contents

- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [Scripts](#scripts)
- [LLM providers](#llm-providers)
- [Optional proxy server](#optional-proxy-server)
- [Architecture](#architecture)
- [Generated output](#generated-output)
- [How to add a new LLM provider](#how-to-add-a-new-llm-provider)
- [How to add a new target framework](#how-to-add-a-new-target-framework)
- [Testing](#testing)
- [Known limitations](#known-limitations)

---

## Quick start

Requirements: **Node.js 20.19+** (or 22.12+) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and either drop in a `.pdf` / `.docx` file or click **Load sample document**, then
follow the steps in the sidebar. The default provider is **Offline demo**, so generation works immediately.

## Using the app

The left sidebar is a five-step wizard (you can jump back to any completed step at any time):

1. **Upload** – drag & drop (or browse for) one or more `.pdf` / `.docx` files (`.txt` / `.md` are accepted too).
   Each file shows its parsing status, the number of screens detected, or an error. **Load sample document**
   adds a built-in "Acme Orders Portal" spec with four screens.
2. **Review Screens** – one card per detected screen. Edit the name and description; add/remove fields
   (and change their type), buttons and layout sections; reorder or delete screens; add screens manually;
   inspect the raw extracted text; and choose a target framework per screen (or use the global default).
3. **Configure LLM** – provider cards for *Offline demo*, *OpenAI*, *Anthropic Claude* and *Local LLM*,
   with masked API-key inputs, model selectors (free text allowed), optional base-URL overrides, a
   **Test connection** button and a status badge. Click **Use this provider** to make it active.
4. **Generate** – choose React or Angular globally, then **Generate all screens**. Each screen shows
   queued / generating / done / error status, an overall progress bar, **Retry** for failures, and
   **Cancel** while running. If a model omits expected files the screen is still marked done with a warning.
5. **Preview & Export** – browse screens and their files in tabs (component, styles, mock data, API service)
   with syntax highlighting and copy-to-clipboard. **Download ZIP** exports every screen; **This screen**
   exports only the selected one.

Dark mode is the default; toggle it at the bottom of the sidebar. Preferences and provider settings persist
in `localStorage`.

### Writing design documents that parse well

The extractor is heuristic (see [limitations](#known-limitations)), and works best with a structure like:

```text
Screen 1: Login
Description: Users sign in with their work email.
Fields:
- Email (email)
- Password (password)
- Remember me (checkbox)
- Role (select: Admin, Editor, Viewer)
Buttons: [ Sign In ] [ Forgot Password ]
Sections: Header, Login form, Footer
```

- Screen headings: `Screen N: Name`, `Name Screen`, or Markdown/Word headings (`## Name`). When none are
  found, each PDF page becomes a screen.
- Keywords (case-insensitive): `Description`, `Fields`/`Inputs`, `Buttons`/`Actions`, `Sections`/`Layout`.
- Field type hints in parentheses (`email`, `password`, `number`, `date`, `select: a, b`, `checkbox`,
  `textarea`…); otherwise types are inferred from the label.
- `[ Button ]` tokens anywhere become buttons; `Label: ______` lines become fields.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (http://localhost:5173). |
| `npm run build` | Type-check (`tsc -b`) and build the production bundle into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest unit tests once. `npm run test:watch` for watch mode. |
| `npm run lint` | Lint with oxlint. |
| `npm run typecheck` | Type-check app, server and config. |
| `npm run server` | Start the optional Express proxy on http://127.0.0.1:8787. |

## LLM providers

| Provider | Needs | Notes |
| --- | --- | --- |
| **Offline demo** | nothing | Deterministic template generator running in the browser. Same output format as a real LLM. |
| **OpenAI** | API key, model (`gpt-4o`, `gpt-4-turbo`, …) | Chat Completions API. Optional base-URL override (Azure/OpenAI-compatible gateways). |
| **Anthropic Claude** | API key, model (`claude-3-5-sonnet-latest`, …) | Messages API; sends the `anthropic-dangerous-direct-browser-access` header for direct browser calls. |
| **Local LLM** | base URL + model name | Any OpenAI-compatible server: Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`, vLLM, llama.cpp server… API key optional. |

Configuration (including keys) is stored only in this browser's `localStorage`; nothing is hard-coded.

**CORS:** OpenAI does not allow direct browser calls, and local servers may need to allow the origin
(e.g. `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`). For these cases enable **Route through local proxy**
on the provider card and run the proxy (below).

## Optional proxy server

`/server` contains a minimal Express (TypeScript) proxy that forwards chat requests to the real providers, so
the browser never talks to them directly and API keys can stay server-side.

```bash
cp .env.example .env      # fill in keys you want to keep server-side (optional)
npm run server            # http://127.0.0.1:8787
npm run dev               # in another terminal; Vite forwards /api/* to the proxy
```

| Route | Upstream |
| --- | --- |
| `GET /api/health` | Status, which server-side keys are configured |
| `POST /api/llm/openai/chat/completions` | `${OPENAI_BASE_URL}/chat/completions` |
| `POST /api/llm/anthropic/messages` | `${ANTHROPIC_BASE_URL}/messages` |
| `POST /api/llm/local/chat/completions` | `${LOCAL_LLM_BASE_URL}/chat/completions` |

- If a key is set in `.env` it is used; otherwise the key typed in the UI is forwarded.
- Upstream URLs come **only** from `.env` (the base-URL field is disabled when proxying), so the proxy cannot
  be used to reach arbitrary hosts. It binds to `127.0.0.1` by default.
- `.env` is git-ignored; never commit real keys.

## Architecture

```text
.
├── index.html, vite.config.ts, tsconfig*.json   # Vite + TS + Tailwind v4 + Vitest config
├── server/                       # optional Express proxy (app.ts = testable app, index.ts = entry)
└── src/
    ├── App.tsx, main.tsx, index.css
    ├── types/index.ts            # Screen, ScreenField, LLMProviderConfig, GeneratedFile, GenerationResult, …
    ├── store/appStore.ts         # Zustand store (wizard step, uploads, screens, providers, results; persisted prefs)
    ├── components/               # Sidebar stepper, step definitions, UI primitives (Button, Badge, ProgressBar…)
    ├── utils/strings.ts          # naming + escaping helpers used by generators
    └── features/
        ├── upload/               # parseDocument (pdfjs-dist / mammoth), detectScreens heuristics, sample fixture, UploadStep
        ├── screens/              # ReviewStep + editable ScreenCard
        ├── llm/                  # LLMClient interface, provider registry, openai-compatible / anthropic / mock clients, SettingsStep
        ├── generate/             # prompt templates, "### FILE:" wire format parser, framework generators, orchestration queue, GenerateStep
        └── preview/              # CodeViewer (react-syntax-highlighter), PreviewStep, ZIP export (jszip + file-saver)
```

### Data flow

```text
File ──parseDocument──▶ text ──detectScreens──▶ Screen[] ──(user edits)──▶ Screen[]
   ──buildGenerationMessages──▶ ChatMessage[] ──LLMClient.complete──▶ text
   ──parseGeneratedFiles──▶ GeneratedFile[] ──▶ GenerationResult ──buildZip──▶ .zip
```

- **Provider abstraction.** The pipeline only depends on `LLMClient`
  (`complete(messages, { signal }) → Promise<string>`, see `src/features/llm/types.ts`).
  `createLLMClient(config)` in `llmService.ts` builds the right client from an `LLMProviderConfig`, so
  switching providers never touches generation code.
- **Prompting & wire format.** `prompts.ts` builds a system prompt (framework guidelines, required files,
  output format) and a user prompt containing the screen as JSON inside `<screen-spec>` tags. Models must
  answer with `### FILE: <path>` headings followed by fenced code blocks; `fileFormat.ts` parses this
  robustly (prose around blocks, bold headers, nested fences) and sanitizes paths (no `..`, no absolute paths).
- **Offline demo.** The mock provider is a real `LLMClient`: it reads the `<screen-spec>` back from the
  prompt, runs the framework's deterministic generator and returns the same `### FILE:` format — so the demo
  exercises exactly the same pipeline as real providers.
- **Orchestration.** `runGenerationQueue` runs screens with bounded concurrency (2), reports
  `queued → generating → done | error` per screen and supports cancellation through `AbortSignal`.
  `generationController.ts` keeps the run alive while you navigate between steps.

### Core types (`src/types/index.ts`)

- `Screen` – id, name, description, `fields: ScreenField[]`, `buttons`, `sections`, raw text, source file, optional framework override.
- `LLMProviderConfig` – provider id, label, model, apiKey?, baseUrl?, temperature?, maxTokens?, useProxy?.
- `GeneratedFile` – path, language, kind (`component` | `template` | `styles` | `mock-data` | `api-service` | `other`), content.
- `GenerationResult` – screen id/name, framework, status, files, provider/model, error?, warnings?, timings.

## Generated output

For each screen (names derived from the screen name, e.g. "Customer List"):

**React** (`customer-list/`)

| File | Purpose |
| --- | --- |
| `CustomerList.tsx` | Function component with loading / error / retry states, controlled form or table/cards/stats, button actions |
| `CustomerList.module.css` | Scoped styles |
| `useCustomerListData.ts` | Typed `fetchCustomerList()` + `useCustomerListData()` hook and action function. `USE_MOCK = true` resolves with the dummy JSON after simulated latency; flip it to call `API_URL` with `fetch`. |
| `customer-list.mock.json` | Dummy API response matching the screen's fields/sections |

**Angular** (`customer-list/`) — standalone component (Angular 17+)

| File | Purpose |
| --- | --- |
| `customer-list.component.ts` / `.html` / `.scss` | Component, template, styles |
| `customer-list.service.ts` | Injectable service; `useMock = true` returns the dummy JSON via `of(...).pipe(delay(600))`, otherwise `HttpClient` |
| `customer-list.mock.json` | Dummy API response |

The ZIP contains `ui-coding-agent-output/<screen>/…`, plus a `README.md` explaining how to use the files and a
`manifest.json` describing the run. The offline templates were verified to compile under `tsc --strict`
(React 18) and `ngc` with `strictTemplates` (Angular 19). React files need a bundler with CSS-modules and JSON
import support (e.g. Vite); Angular files need `resolveJsonModule` and `provideHttpClient()`.

## How to add a new LLM provider

1. Add the id to `ProviderId` in `src/types/index.ts`.
2. Implement a client that satisfies `LLMClient` in `src/features/llm/providers/` (see `openaiCompatible.ts`
   or `anthropic.ts`). Use the injected `fetch`, honour `options.signal`, and throw `LLMError` with a helpful
   message (helpers in `providers/http.ts`). If the provider is OpenAI-compatible you can simply reuse
   `createOpenAICompatibleClient` with a different base URL.
3. Register a `ProviderDefinition` in `PROVIDERS` and add the id to `PROVIDER_ORDER` in
   `src/features/llm/llmService.ts` (label, description, suggested models, default config, whether an API key
   / base URL is required, `createClient`).
4. Add an icon in `ICONS` in `src/features/llm/SettingsStep.tsx`.
5. (Optional) Add a proxy route in `server/app.ts` and set `proxyPath` on the definition.
6. Add tests with a mocked `fetch` in `src/features/llm/llmService.test.ts`.

The settings card, connection test, persistence and generation pipeline pick the new provider up automatically.

## How to add a new target framework

1. Add the id (e.g. `'vue'`) to `TargetFramework` in `src/types/index.ts`.
2. Create `src/features/generate/generators/vue.ts` exporting a `FrameworkGenerator`:
   - `expectedFiles(screen)` – file names + purpose (injected into the LLM prompt and used for warnings),
   - `promptGuidelines` – framework conventions for the LLM,
   - `generateOffline(screen)` – deterministic files for the offline demo (reuse `screenNames`,
     `buildMockData` and the helpers in `generators/types.ts` / `mockData.ts`).
3. Register it in `FRAMEWORK_GENERATORS` in `src/features/generate/generators/index.ts`.

The framework toggles, per-screen selector, prompts, mock provider, preview and ZIP export all read from that
registry. Add a test in `src/features/generate/generation.test.ts`.

## Testing

```bash
npm test
```

Vitest suites (Node environment, no browser needed):

- `upload/detectScreens.test.ts` – screen/field/button/section detection on the sample fixture and edge cases.
- `upload/parseDocument.test.ts` – DOCX parsing via mammoth on a real `.docx` built in-memory, pdf.js line
  reconstruction, plain text, file-type detection and unsupported/empty files.
- `llm/llmService.test.ts` – provider abstraction with mocked `fetch`: request shapes/headers for OpenAI,
  Anthropic and Local, proxy routing, error mapping, validation and connection tests.
- `generate/generation.test.ts` – wire-format parsing and path sanitization, offline generators, prompt
  round-trip, generation queue statuses, warnings and failures.
- `preview/zipExport.test.ts` – ZIP structure, per-screen folders, de-duplication, manifest.
- `server/app.test.ts` – proxy routing and key handling with a mocked upstream.

## Known limitations

- **Text-only extraction.** PDFs are read with pdf.js text extraction and DOCX with mammoth. Scanned/image-only
  PDFs (no text layer) and pure mockup images are not OCR'd; legacy `.doc` files are not supported.
- **Heuristic screen detection.** Unusual document layouts may need manual cleanup in the Review step.
- **LLM output quality varies.** Real models may return incomplete or non-compiling code; missing files are
  flagged with a warning and screens can be retried. Small local models work best with code-tuned weights
  (e.g. `qwen2.5-coder`).
- **API keys in localStorage.** Convenient for local use but readable by any script on the origin. Prefer the
  proxy with keys in `.env` for anything beyond local experimentation.
- **CORS.** Direct browser calls to OpenAI (and some local servers) are blocked; use the proxy.
- **Offline demo output is template-based**, not AI-generated — it reflects the extracted structure (fields,
  buttons, tables, stats, lists) but not visual design details.
- Generated files are standalone snippets, not a full Angular/React project scaffold.
