/**
 * Cron job: close posts whose event_date has passed.
 * Runs every hour. Closes the post (status='closed') and removes from TG channel.
 */
import { getDb } from '../db/connection'
import { deleteChannelMessages } from '../telegram'

export async function expirePosts(): Promise<void> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Find active posts with event_date in the past
  const expired = db.prepare(
    `SELECT id, tg_message_ids FROM post WHERE status='active' AND event_date IS NOT NULL AND event_date < ?`
  ).all(today) as any[]

  if (expired.length === 0) return
  console.log(`[expirePosts] closing ${expired.length} expired posts`)

  const closeStmt = db.prepare("UPDATE post SET status='closed', updated_at=? WHERE id=?")
  const now = new Date().toISOString()

  for (const post of expired) {
    try {
      closeStmt.run(now, post.id)
      // Delete from channel
      if (post.tg_message_ids) {
        try {
          const ids = JSON.parse(post.tg_message_ids)
          await deleteChannelMessages(ids)
        } catch {}
      }
    } catch (err) {
      console.error(`[expirePosts] failed for ${post.id}:`, err)
    }
  }
}

/** Start daily cron */
export function startExpireCron(): void {
  // Run on startup (5 sec delay to let server fully boot)
  setTimeout(() => { expirePosts().catch(() => {}) }, 5000)
  // Run every 24 hours
  setInterval(() => { expirePosts().catch(() => {}) }, 24 * 60 * 60 * 1000)
  console.log('[expirePosts] cron started (runs daily)')
}
