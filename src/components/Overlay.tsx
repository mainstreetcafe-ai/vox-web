import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

// Full-screen overlay host.
//
// MainContainer renders the three panes inside `transform: translateX(...)` with a
// 300%-wide track. A CSS transform creates a containing block, so `position: fixed`
// inside it resolves against THAT box, not the viewport -- overlays came out 3x too
// wide and horizontally offset (observed on device 2026-07-26). Portalling to
// document.body escapes the transformed ancestor, which is the only correct fix.
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
