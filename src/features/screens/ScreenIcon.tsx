import { createElement } from 'react'
import { iconForScreen } from './screenIcon'

export function ScreenIcon({ name, className }: { name: string; className?: string }) {
  return createElement(iconForScreen(name), { className, 'aria-hidden': true })
}
