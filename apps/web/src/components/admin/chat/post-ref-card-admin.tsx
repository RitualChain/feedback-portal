import { Link } from '@tanstack/react-router'
import { ArrowTopRightOnSquareIcon, LightBulbIcon } from '@heroicons/react/24/outline'
import type { ChatCard } from '@/lib/shared/db-types'
import type { ChatCardView } from '@/lib/shared/chat/types'

// Shared admin tokens — bordered card on a faint fill, muted labels, and a
// pill-shaped status chip (mirrors channel-badge / the inbox status chips).
const cardCls = 'rounded-md border border-border bg-muted/20 px-3 py-2'
const pillCls =
  'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium'
const labelCls = 'flex items-center gap-1 text-[11px] text-muted-foreground'
const linkCls =
  'mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline underline-offset-2'

/**
 * Read-only render of a shared-post (`post_ref`) chat card (`message.card`) for
 * the agent inbox. The agent shared the post; the *visitor* is the one who acts
 * on it (view / upvote), so this view carries no buttons — just the post title,
 * board, vote count, and a status chip, which the `card_updated` stream keeps
 * live. Before the server-resolved `cardView` lands it falls back to the raw id.
 */
export function PostRefCardAdmin({
  card,
  cardView,
}: {
  card: ChatCard
  cardView: ChatCardView | null
}) {
  // No enrichment yet (referenced post is gone, or an SSE-delivered message
  // hasn't been enriched) — fall back to the raw-id rendering.
  if (!cardView) return <RawCard card={card} />

  return (
    <div className={cardCls}>
      <p className={labelCls}>
        <LightBulbIcon className="size-3 shrink-0" />
        {card.origin === 'tracked' ? 'Tracked as a feature request' : 'Shared a post'}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{cardView.title}</p>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{cardView.boardName}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{cardView.voteCount}▲</span>
        {cardView.statusName && (
          <StatusDot name={cardView.statusName} color={cardView.statusColor} />
        )}
      </div>
      <Link to="/admin/feedback" search={{ post: card.postId }} className={linkCls}>
        View post
        <ArrowTopRightOnSquareIcon className="size-3" />
      </Link>
    </div>
  )
}

/** Small status chip with a colored dot, tinted from the workspace status color. */
function StatusDot({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className={`${pillCls} ms-1`}
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
    >
      {color && (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      )}
      {name}
    </span>
  )
}

/** Pre-enrichment fallback: prints the raw post id (no board/post lookup). */
function RawCard({ card }: { card: ChatCard }) {
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
