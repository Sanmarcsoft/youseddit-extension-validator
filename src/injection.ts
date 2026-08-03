/*
 * Content-script installation, on demand rather than up front.
 *
 * The extension used to declare `host_permissions: ["<all_urls>"]` and static
 * content scripts matching every URL at document_start. Auto-scan ships OFF, so
 * a fresh install injected into every page a user visited and did nothing with
 * it: the broadest possible request for a feature nobody had switched on. That
 * is what earns the Chrome Web Store's "Broad Host Permissions" review flag,
 * and it is worth the flag.
 *
 * Now:
 *   - Default install holds `activeTab` only. Clicking the toolbar icon and the
 *     right-click item are user gestures, so both work without any host
 *     permission, by injecting into that one tab at that moment.
 *   - Auto-scan is opt-in. Turning it on prompts for `<all_urls>` through
 *     Chrome's own consent dialog, then registers the scripts persistently.
 *     Turning it off unregisters them.
 *
 * The permission REQUEST must come from a user gesture, so it lives in the
 * popup. Everything here assumes the answer is already known.
 */

/** Registered-script ids. Stable, because unregistering needs them. */
const INJECT_ID = 'verifieddit-inject'
const CONTENT_ID = 'verifieddit-content'

/** Set by inject.ts on load; lets us avoid injecting the same frame twice. */
const INJECTED_FLAG = '__verifiedditInjected'

/** True when the user has granted access to all sites. */
export async function hasBroadHostAccess (): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] })
  } catch {
    return false
  }
}

/**
 * Bring the persistent registration in line with the auto-scan preference.
 *
 * Registering requires the host permission, so a preference of "on" without the
 * grant registers nothing: the user is left with the gesture-driven path rather
 * than a silent failure. Called on startup too, so a permission revoked in
 * chrome://extensions does not leave scripts registered behind it.
 */
export async function syncAutoScanScripts (enabled: boolean): Promise<void> {
  let registered: chrome.scripting.RegisteredContentScript[] = []
  try {
    registered = await chrome.scripting.getRegisteredContentScripts({ ids: [INJECT_ID, CONTENT_ID] })
  } catch {
    registered = []
  }

  const wanted = enabled && await hasBroadHostAccess()

  if (wanted && registered.length === 0) {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: INJECT_ID,
          js: ['inject.js'],
          matches: ['<all_urls>'],
          runAt: 'document_start',
          allFrames: true,
          persistAcrossSessions: true
        },
        {
          id: CONTENT_ID,
          js: ['content.js'],
          matches: ['<all_urls>'],
          runAt: 'document_start',
          persistAcrossSessions: true
        }
      ])
    } catch (error) {
      console.debug('Verifieddit: could not register content scripts', error)
    }
    return
  }

  if (!wanted && registered.length > 0) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) })
    } catch (error) {
      console.debug('Verifieddit: could not unregister content scripts', error)
    }
  }
}

/**
 * Put the content scripts into one tab, now, for a single user action.
 *
 * This is the `activeTab` path: no host permission is held, but the user just
 * clicked the toolbar icon or the context-menu item, which grants access to
 * that tab. Injecting twice would double the badge drawing and the message
 * listeners, so the flag is checked first.
 *
 * Returns false when injection is not possible (a chrome:// page, the store, a
 * PDF viewer), which callers should treat as "nothing to show here" rather than
 * as an error.
 */
export async function ensureInjected (tabId: number): Promise<boolean> {
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (flag: string) => (globalThis as unknown as Record<string, unknown>)[flag] === true,
      args: [INJECTED_FLAG]
    })
    if (probe?.result === true) return true

    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['inject.js'] })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return true
  } catch (error) {
    // Restricted pages cannot be scripted at all. Not a failure worth surfacing.
    console.debug('Verifieddit: cannot inject into this tab', error)
    return false
  }
}
