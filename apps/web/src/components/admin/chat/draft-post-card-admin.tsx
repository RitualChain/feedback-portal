import { CheckCircleIcon, LightBulbIcon, XCircleIcon } from '@heroicons/react/24/outline'
import type { ChatCard } from '@/lib/shared/db-types'

// Shared admin tokens — bordered card on a faint fill, muted labels, and a
// pill-shaped status chip (mirrors channel-badge / the inbox status chips).
const cardCls = 'rounded-md border border-border bg-muted/20 px-3 py-2'
const pillCls =
  'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium'
const labelCls = 'flex items-center gap-1 text-[11px] text-muted-foreground'

/**
 * Read-only render of a chat card (`message.card`) for the agent inbox. The
 * agent proposed or shared the card; the *visitor* is the one who acts on it, so
 * this view carries no buttons — just the content and the card's current state,
 * which updates live via the `card_updated` stream.
 */
export function DraftPostCardAdmin({ card }: { card: ChatCard }) {
  if (card.type === 'post_ref') {
    return (
      <div className={cardCls}>
        <p className={labelCls}>
          <LightBulbIcon className="size-3 shrink-0" />
          Shared post
        </p>
        <p className="mt-0.5 truncate text-xs text-foreground/80" title={card.postId}>
          {card.postId}
        </p>
      </div>
    )
  }

  return (
    <div className={cardCls}>
      <div className={labelCls}>
        <LightBulbIcon className="size-3 shrink-0" />
        <span>Suggested post</span>
        <span aria-hidden>·</span>
        <span className="truncate" title={card.boardId}>
          {card.boardId}
        </span>
        <StatusChip card={card} />
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{card.title}</p>
      {card.content && (
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
          {card.content}
        </p>
      )}
      {card.status === 'published' && card.postId && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground/70" title={card.postId}>
          Post {card.postId}
        </p>
      )}
    </div>
  )
}

function StatusChip({ card }: { card: Extract<ChatCard, { type: 'draft_post' }> }) {
  if (card.status === 'published') {
    return (
      <span
        className={`${pillCls} ms-auto bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}
      >
        <CheckCircleIcon className="size-3" />
        Posted
      </span>
    )
  }
  if (card.status === 'dismissed') {
    return (
      <span className={`${pillCls} ms-auto bg-muted text-muted-foreground`}>
        <XCircleIcon className="size-3" />
        Dismissed
      </span>
    )
  }
  return <span className={`${pillCls} ms-auto bg-muted text-muted-foreground`}>Proposed</span>
}
