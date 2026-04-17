// src/components/IC3Chart/overlayManager.js
// Manages save/restore of KLC overlays to/from SQLite via /api/trades/:id

const API_BASE = 'http://localhost:3001'

/**
 * Serialize current chart overlays and save to SQLite via API.
 * Debounced — only saves after 800ms of inactivity.
 * Only saves user-created overlays (skips locked entry/exit markers).
 */
export function createOverlaySaver(chartApi, tradeId) {
  let debounceTimer = null

  return function saveOverlays() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      try {
        // Get all overlays from the main pane, filtering out locked markers
        const allOverlays = chartApi.getOverlayById('')
        // getOverlayById('') returns all overlays in KLC v9
        // Filter to only user-drawn (not locked) overlays
        let overlays = []
        if (Array.isArray(allOverlays)) {
          overlays = allOverlays
            .filter(o => !o.lock)
            .map(o => ({
              name: o.name,
              id: o.id,
              groupId: o.groupId,
              lock: o.lock,
              visible: o.visible,
              zLevel: o.zLevel,
              points: o.points,
              styles: o.styles,
              extendData: o.extendData,
            }))
        }

        const blob = {
          version: '1.0',
          saved_at: new Date().toISOString(),
          overlays,
        }

        await fetch(`${API_BASE}/api/trades/${tradeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations: JSON.stringify(blob) }),
        })
      } catch (err) {
        console.error('[OverlayManager] Save failed:', err)
      }
    }, 800)
  }
}

/**
 * Restore overlays from a JSON blob string saved in the trade record.
 * Silently skips if the blob is missing or malformed.
 */
export function restoreOverlays(chartApi, annotationsJson) {
  if (!annotationsJson) return

  try {
    const blob = JSON.parse(annotationsJson)
    if (!blob.overlays?.length) return

    blob.overlays.forEach(overlay => {
      try {
        chartApi.createOverlay({
          name: overlay.name,
          id: overlay.id,
          groupId: overlay.groupId,
          lock: overlay.lock,
          visible: overlay.visible,
          zLevel: overlay.zLevel,
          points: overlay.points,
          styles: overlay.styles,
          extendData: overlay.extendData,
        })
      } catch (e) {
        console.warn('[OverlayManager] Could not restore overlay:', overlay?.name, e)
      }
    })
  } catch (err) {
    console.error('[OverlayManager] Failed to parse annotations JSON:', err)
  }
}
