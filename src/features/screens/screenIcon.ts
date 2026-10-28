import {
  FormInput,
  LayoutDashboard,
  List,
  LogIn,
  Monitor,
  Settings,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react'

/** Pick an icon that matches the screen's purpose. */
export function iconForScreen(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (/login|sign ?in|auth|register|sign ?up/.test(n)) return LogIn
  if (/dashboard|overview|home|analytics/.test(n)) return LayoutDashboard
  if (/list|table|directory|history|search/.test(n)) return List
  if (/create|edit|new|form|add/.test(n)) return FormInput
  if (/setting|preference|config/.test(n)) return Settings
  if (/profile|account|user/.test(n)) return User
  if (/cart|checkout|order|payment/.test(n)) return ShoppingCart
  return Monitor
}
