import { describe, expect, it } from 'vitest'
import { detectScreens, inferFieldType, parseField, splitList } from './detectScreens'
import { SAMPLE_DOCUMENT_TEXT } from './fixtures/sampleDesign'

describe('detectScreens', () => {
  it('detects every screen in the sample fixture with fields, buttons and sections', () => {
    const screens = detectScreens(SAMPLE_DOCUMENT_TEXT, 'spec.pdf')
    expect(screens.map((s) => s.name)).toEqual(['Login', 'Dashboard', 'Customer List', 'Create Order'])

    const login = screens[0]
    expect(login.description).toMatch(/sign in to the orders portal/)
    expect(login.fields).toEqual([
      { label: 'Email address', type: 'email' },
      { label: 'Password', type: 'password' },
      { label: 'Remember me', type: 'checkbox' },
    ])
    expect(login.buttons).toEqual(['Sign in', 'Forgot password'])
    expect(login.sections).toContain('Centered sign-in card')
    expect(login.sourceFile).toBe('spec.pdf')

    const dashboard = screens[1]
    expect(dashboard.fields[0]).toEqual({
      label: 'Date range',
      type: 'select',
      options: ['Last 7 days', 'Last 30 days', 'This quarter', 'This year'],
    })
    expect(dashboard.fields[1]).toEqual({ label: 'Search orders', type: 'text' })

    const order = screens[3]
    expect(order.fields.map((f) => f.type)).toEqual([
      'text',
      'email',
      'select',
      'number',
      'number',
      'date',
      'checkbox',
      'textarea',
    ])
    expect(order.buttons).toEqual(['Save draft', 'Submit order', 'Cancel'])
  })

  it('supports markdown headings and ignores the document title', () => {
    const text = `# Product spec\nIntro paragraph.\n\n## Profile\nShows the user profile.\n- Avatar\nFields: Full name, Phone number\n[ Save ]  [ Cancel ]\n\n## Settings Page\nToggle preferences.`
    const screens = detectScreens(text)
    expect(screens.map((s) => s.name)).toEqual(['Profile', 'Settings Page'])
    expect(screens[0].fields).toEqual([
      { label: 'Full name', type: 'text' },
      { label: 'Phone number', type: 'tel' },
    ])
    expect(screens[0].buttons).toEqual(['Save', 'Cancel'])
    expect(screens[0].sections).toEqual(['Avatar'])
  })

  it('detects "<name> Screen" headings without matching prose', () => {
    const text = `Login Screen\nUsers land on the dashboard page after this.\nFields: Username, Password\n\nOrder Details Page\nShows a single order.`
    const screens = detectScreens(text)
    expect(screens.map((s) => s.name)).toEqual(['Login', 'Order Details'])
    expect(screens[0].description).toContain('Users land on the dashboard page')
  })

  it('falls back to one screen per page when there are no headings', () => {
    const screens = detectScreens('Welcome\nA landing page.\n\fCheckout\nPay for items.\nButtons: Pay now')
    expect(screens.map((s) => s.name)).toEqual(['Welcome', 'Checkout'])
    expect(screens[1].buttons).toEqual(['Pay now'])
  })

  it('returns an empty list for blank input', () => {
    expect(detectScreens('   \n\f\n ')).toEqual([])
  })
})

describe('field helpers', () => {
  it('infers field types from labels', () => {
    expect(inferFieldType('Work email')).toBe('email')
    expect(inferFieldType('Date of birth')).toBe('date')
    expect(inferFieldType('Quantity')).toBe('number')
    expect(inferFieldType('Mobile phone number')).toBe('tel')
    expect(inferFieldType('Comments')).toBe('textarea')
    expect(inferFieldType('Search by email')).toBe('text')
    expect(inferFieldType('First name')).toBe('text')
  })

  it('parses explicit type hints and options', () => {
    expect(parseField('Country (dropdown: US, UK)')).toEqual({ label: 'Country', type: 'select', options: ['US', 'UK'] })
    expect(parseField('Bio (textarea)')).toEqual({ label: 'Bio', type: 'textarea' })
    expect(parseField('Email: ________')).toEqual({ label: 'Email', type: 'email' })
    expect(parseField('Code (required)')).toEqual({ label: 'Code', type: 'text' })
  })

  it('splits lists without breaking parenthesised options', () => {
    expect(splitList('A, B (select: x, y); C')).toEqual(['A', 'B (select: x, y)', 'C'])
  })
})
