/**
 * Telegram bot for admin notifications and news broadcasting.
 * - Sends alerts when new moderation items arrive
 * - Listens for /news command to broadcast messages to all app users
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
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
          await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: `✅ Новость опубликована! Увидят ${userCount} пользователей при открытии приложения.` }),
          })
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
              text: `🤖 <b>Команды бота</b>\n/news Текст — отправить новость всем\n/stats — статистика приложения\n/help — список команд`,
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
