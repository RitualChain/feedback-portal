import { db, eq, and, isNull, sql, boards, posts, type Board } from '@/lib/server/db'
import { getTableColumns } from 'drizzle-orm'
import type { BoardId } from '@quackback/ids'
import { NotFoundError, InternalError } from '@/lib/shared/errors'
import type { BoardWithStats } from './board.types'
import { boardViewFilter, postViewFilter, ANONYMOUS_ACTOR, type Actor } from '@/lib/server/policy'

export async function getPublicBoardById(boardId: BoardId): Promise<Board> {
  try {
    const board = await db.query.boards.findFirst({
      where: eq(boards.id, boardId),
    })

    if (!board) {
      throw new NotFoundError('BOARD_NOT_FOUND', `Board with ID ${boardId} not found`)
    }

    return board
  } catch (error) {
    if (error instanceof NotFoundError) throw error
    throw new InternalError(
      'DATABASE_ERROR',
      `Failed to fetch board: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}

/**
 * List boards the actor is allowed to see, with post counts.
 *
 * Composes `policy.boards.boardViewFilter` so the result honours per-board
 * audience (public / authenticated / team / segments). The legacy
 * `isPublic = true` filter is gone — it's now derived from audience.
 *
 * Defaults to ANONYMOUS_ACTOR for callers that don't yet pass one
 * (portal anonymous, unauthenticated API). Caller-supplied actors must
 * be built from the request's auth context (see policy.actorFromAuth
 * once Task 13 lands).
 */
export async function listPublicBoardsWithStats(
  actor: Actor = ANONYMOUS_ACTOR
): Promise<BoardWithStats[]> {
  try {
    // The post-count join must apply postViewFilter, not just isNull(deletedAt) —
    // otherwise the count leaks pending/spam/archived posts to non-team users
    // and disagrees with what the actual post list shows them.
    const rows = await db
      .select({
        ...getTableColumns(boards),
        postCount: sql<number>`coalesce(count(${posts.id}), 0)::int`.as('post_count'),
      })
      .from(boards)
      .leftJoin(
        posts,
        and(eq(posts.boardId, boards.id), isNull(posts.deletedAt), postViewFilter(actor))
      )
      .where(and(boardViewFilter(actor), isNull(boards.deletedAt)))
      .groupBy(boards.id)
      .orderBy(boards.name)

    return rows
  } catch (error) {
    throw new InternalError(
      'DATABASE_ERROR',
      `Failed to fetch public boards: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}

export async function getPublicBoardBySlug(
  slug: string,
  actor: Actor = ANONYMOUS_ACTOR
): Promise<Board | null> {
  try {
    // Resolve the board by slug; the audience check happens via
    // canViewBoard so the caller's perspective drives visibility.
    const board = await db.query.boards.findFirst({
      where: and(eq(boards.slug, slug), isNull(boards.deletedAt)),
    })

    if (!board) return null
    const { canViewBoard } = await import('@/lib/server/policy')
    return canViewBoard(actor, board).allowed ? board : null
  } catch (error) {
    throw new InternalError(
      'DATABASE_ERROR',
      `Failed to fetch board: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}

export async function countBoards(): Promise<number> {
  try {
    const result = await db.select({ count: sql<number>`count(*)`.as('count') }).from(boards)

    return Number(result[0]?.count ?? 0)
  } catch (error) {
    throw new InternalError(
      'DATABASE_ERROR',
      `Failed to count boards: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}

export async function validateBoardExists(boardId: BoardId): Promise<Board> {
  try {
    const board = await db.query.boards.findFirst({
      where: eq(boards.id, boardId),
    })

    if (!board) {
      throw new NotFoundError('BOARD_NOT_FOUND', `Board ${boardId} not found`)
    }

    return board
  } catch (error) {
    if (error instanceof NotFoundError) throw error
    throw new InternalError(
      'DATABASE_ERROR',
      `Failed to validate board: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    )
  }
}
