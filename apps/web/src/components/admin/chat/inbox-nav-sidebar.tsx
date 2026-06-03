import { useQuery } from '@tanstack/react-query'
import {
  ChatBubbleLeftRightIcon,
  InboxIcon,
  AtSymbolIcon,
  InboxArrowDownIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import type { ChatTagId } from '@quackback/ids'
import { fetchChatTagsWithCountsFn } from '@/lib/server/functions/chat-tags'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/shared/utils'

/**
 * The active left-nav selection. A single item is highlighted at a time: one of
 * the Conversations views, or one Label. Assignee/status/search in the list
 * header refine WITHIN the selected scope. Carries only ids so it round-trips
 * through the URL; the label is resolved from the fetched tag list.
 */
export type InboxView = 'all' | 'mentions' | 'unattended'
export type InboxNavItem = { kind: 'view'; view: InboxView } | { kind: 'tag'; tagId: ChatTagId }

/** Stable identity for query keys + active-state comparison. */
export function inboxNavKey(nav: InboxNavItem): string {
  return nav.kind === 'tag' ? `tag:${nav.tagId}` : `view:${nav.view}`
}

export const CONVERSATION_VIEWS = [
  { view: 'all', label: 'All', Icon: InboxIcon },
  { view: 'mentions', label: 'Mentions', Icon: AtSymbolIcon },
  { view: 'unattended', label: 'Unattended', Icon: InboxArrowDownIcon },
] as const

export type ChatTagWithCount = { id: ChatTagId; name: string; color: string; count: number }

const CHAT_TAG_COUNTS_KEY = ['admin', 'inbox', 'chat-tags', 'counts'] as const

/** Shared (deduped) source of the labels + per-tag conversation counts. */
export function useChatTagsWithCounts() {
  return useQuery({
    queryKey: CHAT_TAG_COUNTS_KEY,
    queryFn: () => fetchChatTagsWithCountsFn() as Promise<ChatTagWithCount[]>,
    staleTime: 60_000,
  })
}

/** Human label for the active scope, resolving a tag id against the tag list. */
export function scopeLabelFor(nav: InboxNavItem, tags?: ChatTagWithCount[]): string {
  if (nav.kind === 'tag') return tags?.find((t) => t.id === nav.tagId)?.name ?? 'Label'
  return nav.view === 'mentions'
    ? 'Mentions'
    : nav.view === 'unattended'
      ? 'Unattended'
      : 'All conversations'
}

const itemClass = (active: boolean) =>
  cn(
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
    active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted'
  )

/**
 * Grouped inbox navigation: a Conversations group (All / Mentions / Unattended)
 * and a Labels group with per-tag conversation counts. Desktop-only (md+); the
 * mobile equivalent is InboxScopeMenu in the list header.
 */
export function InboxNavSidebar({
  nav,
  onSelect,
}: {
  nav: InboxNavItem
  onSelect: (item: InboxNavItem) => void
}) {
  const { data: tags } = useChatTagsWithCounts()
  const activeKey = inboxNavKey(nav)

  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r border-border/50 md:flex">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary" />
        </div>
        <h1 className="text-lg font-semibold leading-tight">Conversations</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Conversations
        </p>
        {CONVERSATION_VIEWS.map(({ view, label, Icon }) => {
          const item: InboxNavItem = { kind: 'view', view }
          return (
            <button
              key={view}
              type="button"
              onClick={() => onSelect(item)}
              className={itemClass(activeKey === inboxNavKey(item))}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          )
        })}

        {tags && tags.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Labels
            </p>
            {tags.map((t) => {
              const item: InboxNavItem = { kind: 'tag', tagId: t.id }
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={itemClass(activeKey === inboxNavKey(item))}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.count}</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </nav>
  )
}

/**
 * Mobile scope switcher (md:hidden) shown in the list header, since the nav
 * sidebar is desktop-only. Same options as the sidebar, in a dropdown.
 */
export function InboxScopeMenu({
  nav,
  onSelect,
}: {
  nav: InboxNavItem
  onSelect: (item: InboxNavItem) => void
}) {
  const { data: tags } = useChatTagsWithCounts()
  const activeKey = inboxNavKey(nav)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold leading-tight"
        >
          <span className="truncate">{scopeLabelFor(nav, tags)}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Conversations
        </DropdownMenuLabel>
        {CONVERSATION_VIEWS.map(({ view, label, Icon }) => {
          const item: InboxNavItem = { kind: 'view', view }
          return (
            <DropdownMenuItem
              key={view}
              onClick={() => onSelect(item)}
              className={cn('gap-2', activeKey === inboxNavKey(item) && 'text-primary')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          )
        })}
        {tags && tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Labels
            </DropdownMenuLabel>
            {tags.map((t) => {
              const item: InboxNavItem = { kind: 'tag', tagId: t.id }
              return (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => onSelect(item)}
                  className={cn('gap-2', activeKey === inboxNavKey(item) && 'text-primary')}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.count}</span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
