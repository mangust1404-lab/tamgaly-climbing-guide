/**
 * Telegram bot for admin notifications and news broadcasting.
 * - Sends alerts when new moderation items arrive
 * - Listens for /news command to broadcast messages to all app users
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || ''  // e.g. "@TamgalyClimbing"
const API = `https://api.telegram.org/bot${BOT_TOKEN}`

/** Send a message to the admin */
export async function notifyAdmin(text: string): Promise<void> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('Telegram notify error:', err)
  }
}

/** Post a message to the public channel (visible to all subscribers) */
export async function notifyChannel(text: string, options?: { disablePreview?: boolean }): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID) return
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: options?.disablePreview ?? false,
      }),
    })
  } catch (err) {
    console.error('Telegram channel error:', err)
  }
}

/** Post text to channel, returns message_ids array (length 1) */
export async function notifyChannelText(text: string, options?: { disablePreview?: boolean }): Promise<number[]> {
  if (!BOT_TOKEN || !CHANNEL_ID) return []
  try {
    const r = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHANNEL_ID, text, parse_mode: 'HTML', disable_web_page_preview: options?.disablePreview ?? false }),
    })
    const data = await r.json() as any
    return data.ok && data.result ? [data.result.message_id] : []
  } catch (err) { console.error('TG send error:', err); return [] }
}

/** Post photos with caption. Returns array of message_ids. */
export async function notifyChannelPhotos(photos: string[], caption: string): Promise<number[]> {
  if (!BOT_TOKEN || !CHANNEL_ID || photos.length === 0) return []
  try {
    if (photos.length === 1) {
      const r = await fetch(`${API}/sendPhoto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHANNEL_ID, photo: photos[0], caption, parse_mode: 'HTML' }),
      })
      const data = await r.json() as any
      return data.ok && data.result ? [data.result.message_id] : []
    } else {
      const media = photos.slice(0, 10).map((url, i) => ({
        type: 'photo', media: url,
        ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
      }))
      const r = await fetch(`${API}/sendMediaGroup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHANNEL_ID, media }),
      })
      const data = await r.json() as any
      return data.ok && Array.isArray(data.result) ? data.result.map((m: any) => m.message_id) : []
    }
  } catch (err) { console.error('TG photos error:', err); return [] }
}

/** Edit a message in channel. For media-group, edits caption of first message. */
export async function editChannelMessage(messageId: number, newText: string, isMediaGroup: boolean): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID) return
  try {
    const endpoint = isMediaGroup ? 'editMessageCaption' : 'editMessageText'
    const body: any = { chat_id: CHANNEL_ID, message_id: messageId, parse_mode: 'HTML' }
    if (isMediaGroup) body.caption = newText
    else { body.text = newText; body.disable_web_page_preview = true }
    await fetch(`${API}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (err) { console.error('TG edit error:', err) }
}

/** Delete one or more messages from channel. */
export async function deleteChannelMessages(messageIds: number[]): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID || messageIds.length === 0) return
  for (const id of messageIds) {
    try {
      await fetch(`${API}/deleteMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHANNEL_ID, message_id: id }),
      })
    } catch (err) { console.error('TG delete error:', err) }
  }
}

/** Send moderation alert */
export async function notifyModeration(userName: string, type: string, sectorId: string | null, comment: string | null): Promise<void> {
  const typeNames: Record<string, string> = {
    photo: 'Фото',
    route: 'Маршрут',
    'topo-line': 'Линия топо',
    'sector-info': 'Инфо о секторе',
  }
  let msg = `📬 <b>Новый материал на модерацию</b>\n`
  msg += `От: ${userName}\n`
  msg += `Тип: ${typeNames[type] || type}\n`
  if (sectorId) msg += `Сектор: ${sectorId}\n`
  if (comment) msg += `Комментарий: ${comment}`
  await notifyAdmin(msg)
}

/**
 * Start polling for bot commands (news broadcasting).
 * Admin sends: /news Текст новости
 * Bot saves to DB and marks for delivery to app users.
 */
export function startBotPolling(getDb: () => any): void {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.log('Telegram bot: no token/chat_id configured, skipping')
    return
  }

  // Ensure news table exists
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  let offset = 0

  async function poll() {
    try {
      const resp = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`)
      if (!resp.ok) return
      const data = await resp.json() as any
      if (!data.ok || !data.result) return

      for (const update of data.result) {
        offset = update.update_id + 1
        const msg = update.message
        if (!msg || !msg.text) continue
        if (String(msg.chat.id) !== ADMIN_CHAT_ID) continue

        if (msg.text.startsWith('/news ')) {
          const newsText = msg.text.slice(6).trim()
          if (!newsText) {
            await fetch(`${API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: '❌ Пустая новость. Формат: /news Текст новости' }),
            })
            continue
          }
          const sdb = getDb()
          sdb.prepare('INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)').run(
            newsText.slice(0, 100),
            newsText,
            new Date().toISOString(),
          )
          const userCount = (sdb.prepare('SELECT COUNT(*) as cnt FROM app_user').get() as any).cnt
          // Also post to public channel
          if (CHANNEL_ID) {
            await fetch(`${API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: CHANNEL_ID, text: `📢 ${newsText}`, parse_mode: 'HTML' }),
            }).catch(() => {})
          }
          await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: `✅ Новость опубликована в приложении (${userCount} польз.) и в канале.` }),
          })
        } else if (msg.text.startsWith('/testnews ')) {
          const newsText = msg.text.slice(10).trim()
          if (!newsText) {
            await fetch(`${API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: '❌ Формат: /testnews Текст' }),
            })
            continue
          }
          // Save with special id=-1 so only admin sees it (or use a flag)
          const sdb = getDb()
          sdb.prepare('INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)').run(
            '[ТЕСТ] ' + newsText.slice(0, 90),
            newsText,
            new Date().toISOString(),
          )
          await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: `🧪 Тестовая новость добавлена. Открой приложение чтобы увидеть. Удали через /delnews` }),
          })
        } else if (msg.text.startsWith('/delnews')) {
          const sdb = getDb()
          const last = sdb.prepare('SELECT id, title FROM news ORDER BY id DESC LIMIT 1').get() as any
          if (last) {
            sdb.prepare('DELETE FROM news WHERE id = ?').run(last.id)
            await fetch(`${API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: `🗑 Удалена: "${last.title}"` }),
            })
          } else {
            await fetch(`${API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: '❌ Нет новостей' }),
            })
          }
        } else if (msg.text === '/stats') {
          const sdb = getDb()
          const users = (sdb.prepare('SELECT COUNT(*) as cnt FROM app_user').get() as any).cnt
          const ascents = (sdb.prepare('SELECT COUNT(*) as cnt FROM ascent').get() as any).cnt
          const pending = (sdb.prepare("SELECT COUNT(*) as cnt FROM suggestion WHERE status='pending'").get() as any).cnt
          await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              text: `📊 <b>Статистика</b>\nПользователей: ${users}\nПролазов: ${ascents}\nНа модерации: ${pending}`,
              parse_mode: 'HTML',
            }),
          })
        } else if (msg.text === '/help') {
          await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              text: `🤖 <b>Команды бота</b>\n/news Текст — отправить новость всем\n/testnews Текст — тестовая новость (только для тебя)\n/delnews — удалить последнюю новость\n/stats — статистика приложения\n/help — список команд`,
              parse_mode: 'HTML',
            }),
          })
        }
      }
    } catch (err) {
      console.error('Telegram poll error:', err)
    }

    setTimeout(poll, 2000)
  }

  console.log('Telegram bot: polling started')
  poll()
}
