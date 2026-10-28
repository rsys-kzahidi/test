import { ArrowRight, FileUp, LayoutGrid, Plus } from 'lucide-react'
import { Button, EmptyState, PageHeader, Segmented } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { uid } from '../../utils/strings'
import { BrandingCard } from '../branding/BrandingCard'
import { FRAMEWORK_OPTIONS } from '../generate/generators'
import { ScreenCard } from './ScreenCard'

export function ReviewStep() {
  const { screens, updateScreen, removeScreen, moveScreen, addScreens, framework, setFramework, setStep } =
    useAppStore()

  const addBlank = () =>
    addScreens([
      {
        id: uid('screen'),
        name: `New screen ${screens.length + 1}`,
        description: 'Describe what this screen does.',
        sections: [],
        fields: [],
        buttons: ['Save'],
        rawText: '',
      },
    ])

  if (screens.length === 0) {
    return (
      <>
        <PageHeader title="Review screens" />
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title="No screens yet"
          action={
            <div className="flex gap-2">
              <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => setStep('upload')}>
                Upload a document
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={addBlank}>
                Add screen manually
              </Button>
            </div>
          }
        >
          Upload a PDF or Word design document (or load the sample) to extract screens automatically.
        </EmptyState>
      </>
    )
  }

  const totals = screens.reduce(
    (acc, s) => ({ fields: acc.fields + s.fields.length, buttons: acc.buttons + s.buttons.length }),
    { fields: 0, buttons: 0 },
  )

  return (
    <>
      <PageHeader
        title="Review screens"
        description={`${screens.length} screens · ${totals.fields} fields · ${totals.buttons} buttons detected. Edit names, descriptions, fields and buttons before generating code.`}
        actions={
          <>
            <Segmented label="Default target framework" value={framework} options={FRAMEWORK_OPTIONS} onChange={setFramework} />
            <Button icon={<Plus className="size-4" />} onClick={addBlank}>
              Add screen
            </Button>
          </>
        }
      />
      <BrandingCard />
      <div className="grid gap-5 md:grid-cols-2">
        {screens.map((screen, i) => (
          <ScreenCard
            key={screen.id}
            screen={screen}
            index={i}
            total={screens.length}
            globalFramework={framework}
            onChange={(patch) => updateScreen(screen.id, patch)}
            onRemove={() => removeScreen(screen.id)}
            onMove={(d) => moveScreen(screen.id, d)}
          />
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <Button variant="primary" size="lg" icon={<ArrowRight className="size-4" />} onClick={() => setStep('configure')}>
          Configure LLM
        </Button>
      </div>
    </>
  )
}
