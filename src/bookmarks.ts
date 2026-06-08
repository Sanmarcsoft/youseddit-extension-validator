/*
 * rc14 / #93 — Bookmark-save helpers for verified images.
 *
 * Saves each verification as a plain https bookmark under a per-user
 * "Verifieddit" folder. Free + synced-via-browser + recoverable via
 * the user's native bookmark tools.
 *
 * All chrome.bookmarks.* calls live on the background side because the
 * API isn't available in content scripts. The overlay panel triggers
 * save via MSG_SAVE_BOOKMARK; this module handles everything else.
 */

// Fixed — not user-editable. Matches the product brand URL so saved
// bookmarks are instantly recognisable in the user's bookmark tree.
export const FOLDER_NAME = 'verifieddit.com'
export const DEFAULT_PARENT_ID = '1' // Chrome's "Bookmarks Bar"
export const OTHER_BOOKMARKS_ID = '2' // Chrome's "Other bookmarks"

export type SortMode = 'chronological' | 'filename'

export interface SaveBookmarkRequest {
  /** Image URL to save. Gets wrapped in the Verifieddit verification URL. */
  imageUrl: string
  /** Short title line — usually filename + status. */
  title: string
}

export interface SaveBookmarkResult {
  status: 'created' | 'already-exists' | 'error'
  bookmarkId?: string
  folderId?: string
  error?: string
}

export interface BookmarkSettings {
  parentId: string
  sortMode: SortMode
}

/** Resolve the user's saved folder-location preference, falling back to defaults. */
export async function getBookmarkSettings (): Promise<BookmarkSettings> {
  try {
    const stored = await chrome.storage.local.get(['bookmarkParentId', 'bookmarkSortMode'])
    const parentId = stored.bookmarkParentId === OTHER_BOOKMARKS_ID ? OTHER_BOOKMARKS_ID : DEFAULT_PARENT_ID
    const sortMode: SortMode = stored.bookmarkSortMode === 'filename' ? 'filename' : 'chronological'
    return { parentId, sortMode }
  } catch {
    return { parentId: DEFAULT_PARENT_ID, sortMode: 'chronological' }
  }
}

/** Write settings back. Folder name is deliberately NOT settable. */
export async function setBookmarkSettings (settings: Partial<BookmarkSettings>): Promise<void> {
  const payload: Record<string, string> = {}
  if (settings.parentId !== undefined) payload.bookmarkParentId = settings.parentId
  if (settings.sortMode !== undefined) payload.bookmarkSortMode = settings.sortMode
  await chrome.storage.local.set(payload)
}

/**
 * Return the verifieddit.com folder under the configured parent, creating
 * it if absent. First time the user saves anything, the folder appears at
 * their browser's default bookmark location.
 */
async function ensureFolder (parentId: string): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const children = await chrome.bookmarks.getChildren(parentId)
  const existing = children.find((c) => c.title === FOLDER_NAME && (c.url == null || c.url === ''))
  if (existing != null) return existing
  return await chrome.bookmarks.create({ parentId, title: FOLDER_NAME })
}

/**
 * Save a verification as a bookmark. Idempotent: if a bookmark with the
 * same URL already sits in the folder, no duplicate is created. After
 * insertion (or detection of a duplicate), the folder is re-ordered
 * according to the user's sortMode preference so the view in the
 * browser's bookmark manager stays consistent.
 */
export async function saveVerificationBookmark (req: SaveBookmarkRequest): Promise<SaveBookmarkResult> {
  try {
    // `bookmarks` is an optional permission (#114). If it has not been granted
    // (e.g. the request came from the in-page overlay, which cannot prompt for
    // it), fail gracefully instead of throwing on an undefined chrome.bookmarks.
    if (chrome.bookmarks == null) {
      return { status: 'error', error: 'bookmarks permission not granted' }
    }
    const settings = await getBookmarkSettings()
    const folder = await ensureFolder(settings.parentId)
    if (folder.id == null) return { status: 'error', error: 'Folder has no id' }

    const target = buildBookmarkUrl(req.imageUrl)
    const children = await chrome.bookmarks.getChildren(folder.id)
    const dup = children.find((c) => c.url === target)
    let status: SaveBookmarkResult['status']
    let bookmarkId: string | undefined
    if (dup != null) {
      status = 'already-exists'
      bookmarkId = dup.id
    } else {
      const created = await chrome.bookmarks.create({
        parentId: folder.id,
        title: req.title.slice(0, 250),
        url: target
      })
      status = 'created'
      bookmarkId = created.id
    }

    await sortFolder(folder.id, settings.sortMode)
    return { status, bookmarkId, folderId: folder.id }
  } catch (err) {
    return { status: 'error', error: (err as Error)?.message ?? String(err) }
  }
}

/**
 * Re-order the folder contents in-place by the chosen sort mode.
 * chronological  — by dateAdded ascending (oldest → newest, appending
 *                  as the default "newest at bottom" behaviour of
 *                  browsers).
 * filename       — by title ascending, using a locale-aware compare so
 *                  unicode filenames sort predictably.
 * chrome.bookmarks.move accepts an `index` in the parent; Chrome does
 * the shuffle.
 */
export async function sortFolder (folderId: string, mode: SortMode): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId)
  const sorted = [...children].sort((a, b) => {
    if (mode === 'filename') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    // chronological — chrome.bookmarks returns dateAdded as number
    return (a.dateAdded ?? 0) - (b.dateAdded ?? 0)
  })
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].id !== children[i]?.id) {
      await chrome.bookmarks.move(sorted[i].id, { parentId: folderId, index: i })
    }
  }
}

/**
 * Build the bookmark target URL. Points at verifieddit.com so the click
 * re-runs the verification on the site. Appends `&saved=1` so the site
 * can (optionally, future) show a subtle "restored from bookmark" hint.
 */
export function buildBookmarkUrl (imageUrl: string): string {
  const u = new URL('https://www.verifieddit.com/')
  u.searchParams.set('url', imageUrl)
  u.searchParams.set('saved', '1')
  return u.toString()
}
