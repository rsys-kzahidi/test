import { clsx } from 'clsx'
import { AlertCircle, ArrowRight, CheckCircle2, FileText, FileUp, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Badge, Button, PageHeader } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { uid } from '../../utils/strings'
import { cancelGeneration } from '../generate/generationController'
import { detectScreens } from './detectScreens'
import { SAMPLE_DOCUMENT_NAME, SAMPLE_DOCUMENT_TEXT } from './fixtures/sampleDesign'
import { ACCEPTED_EXTENSIONS, getDocumentKind, parseDocument } from './parseDocument'

const MAX_FILE_SIZE = 25 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function UploadStep() {
  const { uploads, upsertUpload, removeUpload, addScreens, screens, setStep, clearScreens } = useAppStore()
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
      await Promise.all(
        files.map(async (file) => {
          const id = uid('doc')
          const base = { id, name: file.name, size: file.size }
          if (!getDocumentKind(file.name, file.type)) {
            upsertUpload({ ...base, status: 'error', error: 'Unsupported file type. Use .pdf or .docx.' })
            return
          }
          if (file.size > MAX_FILE_SIZE) {
            upsertUpload({ ...base, status: 'error', error: `File is larger than ${formatSize(MAX_FILE_SIZE)}.` })
            return
          }
          upsertUpload({ ...base, status: 'parsing' })
          try {
            const parsed = await parseDocument(file)
            if (parsed.screens.length === 0) throw new Error('No screens could be detected in this document.')
            addScreens(parsed.screens)
            upsertUpload({ ...base, status: 'parsed', screenCount: parsed.screens.length })
          } catch (err) {
            upsertUpload({ ...base, status: 'error', error: err instanceof Error ? err.message : String(err) })
          }
        }),
      )
    },
    [upsertUpload, addScreens],
  )

  const loadSample = () => {
    const id = uid('doc')
    const detected = detectScreens(SAMPLE_DOCUMENT_TEXT, SAMPLE_DOCUMENT_NAME)
    addScreens(detected)
    upsertUpload({
      id,
      name: SAMPLE_DOCUMENT_NAME,
      size: new Blob([SAMPLE_DOCUMENT_TEXT]).size,
      status: 'parsed',
      screenCount: detected.length,
    })
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const parsing = uploads.some((u) => u.status === 'parsing')

  return (
    <>
      <PageHeader
        title="Upload design documents"
        description="Drop PDF or Word files containing your UI screen mockups or descriptions. The agent extracts each screen's title, description, layout sections, fields and buttons."
        actions={
          <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={loadSample}>
            Load sample document
          </Button>
        }
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files: drag and drop or press Enter to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition',
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500/60 dark:hover:bg-slate-900/60',
        )}
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <UploadCloud className="size-7" aria-hidden />
        </div>
        <div>
          <p className="text-base font-semibold">
            {dragging ? 'Drop to upload' : 'Drag & drop files here, or click to browse'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Supports .pdf and .docx (also .txt / .md) · up to {formatSize(MAX_FILE_SIZE)} each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {uploads.length > 0 && (
        <section className="mt-8" aria-labelledby="files-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="files-heading" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Files ({uploads.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                cancelGeneration()
                clearScreens()
              }}
            >
              Clear all
            </Button>
          </div>
          <ul className="card divide-y divide-slate-200 dark:divide-slate-800">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-4 px-4 py-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {u.name.toLowerCase().endsWith('.pdf') ? <FileText className="size-5" /> : <FileUp className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatSize(u.size)}
                    {u.status === 'error' && <span className="text-red-600 dark:text-red-400"> · {u.error}</span>}
                  </p>
                </div>
                {u.status === 'parsing' && (
                  <Badge tone="brand" icon={<Loader2 className="size-3 animate-spin" />}>
                    Parsing…
                  </Badge>
                )}
                {u.status === 'parsed' && (
                  <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
                    {u.screenCount} screen{u.screenCount === 1 ? '' : 's'} detected
                  </Badge>
                )}
                {u.status === 'error' && (
                  <Badge tone="danger" icon={<AlertCircle className="size-3" />}>
                    Failed
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${u.name} from the list`}
                  onClick={() => removeUpload(u.id)}
                  icon={<Trash2 className="size-3.5" />}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {screens.length > 0 ? `${screens.length} screen${screens.length === 1 ? '' : 's'} ready for review.` : 'No screens yet.'}
        </p>
        <Button
          variant="primary"
          size="lg"
          disabled={screens.length === 0 || parsing}
          onClick={() => setStep('review')}
          icon={<ArrowRight className="size-4" />}
        >
          Review screens
        </Button>
      </div>
    </>
  )
}
