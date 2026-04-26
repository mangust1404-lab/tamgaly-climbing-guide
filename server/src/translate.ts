/**
 * Translate Russian text to English/Kazakh via free Google Translate endpoint.
 * No API key required, rate-limited per IP. Returns original text on error.
 */
export async function autoTranslate(text: string, targetLang: 'en' | 'kk'): Promise<string> {
  if (!text || text.length < 3) return text
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    const resp = await fetch(url)
    if (!resp.ok) return text
    const data = await resp.json() as any[][]
    return data[0].map((seg: any[]) => seg[0]).join('')
  } catch {
    return text
  }
}
