import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isValidTypeId } from '@quackback/ids'
import { QuackbackEmbedCard } from '@/components/shared/quackback-embed-card'

interface EmbedTarget {
  el: HTMLElement
  kind: 'post' | 'changelog'
  id: string
}

/**
 * Hydrates Quackback link embeds inside a static rich-text surface.
 *
 * Display surfaces render saved content as static HTML (`generateContentHTML`
 * → `dangerouslySetInnerHTML`), not a live editor, so an embed node serializes
 * to an inert `<div data-quackback-embed data-kind data-id>` placeholder. This
 * wrapper mirrors {@link MentionHoverCardOverlay}: it owns the container `div`,
 * scans it for placeholders after each render, and portals a live
 * {@link QuackbackEmbedCard} into each one. A malformed placeholder (missing or
 * foreign kind/id) is simply skipped, so an embed never breaks the page.
 */
export function EmbedHydration({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [targets, setTargets] = useState<EmbedTarget[]>([])

  // Re-scan whenever the rendered content changes. Surfaces pass a fresh
  // `RichTextContent` element when their content changes, which re-runs
  // `dangerouslySetInnerHTML` and produces new placeholder elements; the new
  // `children` reference re-fires this effect so portals retarget. We never
  // mutate the placeholders ourselves here, so there's no observer loop.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const found: EmbedTarget[] = []
    root.querySelectorAll<HTMLElement>('[data-quackback-embed]').forEach((el) => {
      const kind = el.getAttribute('data-kind')
      const id = el.getAttribute('data-id')
      // Re-validate kind AND the id's TypeID shape (defense in depth): a stray
      // placeholder that ever slipped past the write sanitizer can't trigger a
      // lookup with a junk id.
      if ((kind === 'post' || kind === 'changelog') && id && isValidTypeId(id, kind))
        found.push({ el, kind, id })
    })
    setTargets(found)
  }, [children])

  return (
    <div ref={containerRef} className={className} data-slot="embed-hydration">
      {children}
      {targets.map((t, i) =>
        createPortal(<QuackbackEmbedCard kind={t.kind} id={t.id} />, t.el, `${t.kind}:${t.id}:${i}`)
      )}
    </div>
  )
}
