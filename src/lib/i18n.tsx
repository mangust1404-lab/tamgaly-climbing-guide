import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Lang = 'ru' | 'en'

const translations = {
  // Navigation
  'nav.home': { ru: 'Главная', en: 'Home' },
  'nav.map': { ru: 'Карта', en: 'Map' },
  'nav.leaderboard': { ru: 'Рейтинг', en: 'Leaderboard' },
  'nav.profile': { ru: 'Профиль', en: 'Profile' },

  // Status bar
  'status.offline': { ru: 'Офлайн', en: 'Offline' },
  'status.pending': { ru: '{n} ожидает синхронизации', en: '{n} pending sync' },
  'status.syncing': { ru: 'Синхронизация...', en: 'Syncing...' },
  'status.sync': { ru: 'Синхронизировать', en: 'Sync' },

  // Common
  'loading': { ru: 'Загрузка...', en: 'Loading...' },
  'save': { ru: 'Сохранить', en: 'Save' },
  'saving': { ru: 'Сохранение...', en: 'Saving...' },
  'cancel': { ru: 'Отмена', en: 'Cancel' },
  'back': { ru: 'Назад', en: 'Back' },
  'next': { ru: 'Далее', en: 'Next' },
  'skip': { ru: 'Пропустить', en: 'Skip' },

  // Home
  'home.title': { ru: 'Тамгалы-Тас', en: 'Tamgaly-Tas' },
  'home.subtitle': { ru: 'Скалолазный гайд', en: 'Climbing Guide' },
  'home.sectors': { ru: 'Секторы', en: 'Sectors' },
  'home.routes': { ru: 'маршрутов', en: 'routes' },

  // Sector
  'sector.routes': { ru: 'Маршруты', en: 'Routes' },
  'sector.approach': { ru: 'Подход', en: 'Approach' },
  'sector.orientation': { ru: 'Ориентация', en: 'Orientation' },

  // Route
  'route.logAscent': { ru: 'Залогировать пролаз', en: 'Log ascent' },
  'route.review': { ru: 'Отзыв', en: 'Review' },
  'route.ascents': { ru: 'Пролазы', en: 'Ascents' },
  'route.reviews': { ru: 'Отзывы', en: 'Reviews' },
  'route.noAscents': { ru: 'Пока никто не пролез', en: 'No ascents yet' },
  'route.firstAscent': { ru: 'Первопроход', en: 'First ascent' },
  'route.community': { ru: 'Мнение сообщества', en: 'Community opinion' },
  'route.softer': { ru: 'Мягче', en: 'Softer' },
  'route.harder': { ru: 'Жёстче', en: 'Harder' },
  'route.fair': { ru: 'В точку', en: 'Fair' },
  'route.points': { ru: 'очков', en: 'points' },

  // Ascent form
  'ascent.title': { ru: 'Залогировать пролаз', en: 'Log ascent' },
  'ascent.style': { ru: 'Стиль', en: 'Style' },
  'ascent.date': { ru: 'Дата', en: 'Date' },
  'ascent.rating': { ru: 'Оценка маршрута', en: 'Route rating' },
  'ascent.gradeOpinion': { ru: 'как тебе?', en: 'how does it feel?' },
  'ascent.yourGrade': { ru: 'Твоя оценка категории (необязательно):', en: 'Your grade opinion (optional):' },
  'ascent.notes': { ru: 'Заметки', en: 'Notes' },
  'ascent.notesPlaceholder': { ru: 'Комментарий, условия, бета...', en: 'Comment, conditions, beta...' },

  // Styles
  'style.onsight': { ru: 'Онсайт', en: 'Onsight' },
  'style.flash': { ru: 'Флэш', en: 'Flash' },
  'style.redpoint': { ru: 'Редпоинт', en: 'Redpoint' },
  'style.toprope': { ru: 'Топроуп', en: 'Toprope' },
  'style.attempt': { ru: 'Попытка', en: 'Attempt' },

  // Route types
  'routeType.sport': { ru: 'Спорт', en: 'Sport' },
  'routeType.trad': { ru: 'Трад', en: 'Trad' },
  'routeType.boulder': { ru: 'Боулдер', en: 'Boulder' },
  'routeType.multi-pitch': { ru: 'Мультипитч', en: 'Multi-pitch' },

  // Map
  'map.nearest': { ru: 'Ближайший:', en: 'Nearest:' },
  'map.myPosition': { ru: 'Моя позиция', en: 'My position' },

  // Review
  'review.gradeOpinion.Soft': { ru: 'Мягче', en: 'Soft' },
  'review.gradeOpinion.Hard': { ru: 'Жёстче', en: 'Hard' },
  'review.gradeOpinion.Fair': { ru: 'Норм', en: 'Fair' },
  'review.pendingSync': { ru: 'ожидает синхр.', en: 'pending sync' },

  // Leaderboard
  'leaderboard.title': { ru: 'Рейтинг', en: 'Leaderboard' },
  'leaderboard.allTime': { ru: 'Всё время', en: 'All time' },
  'leaderboard.season': { ru: 'Сезон', en: 'Season' },
  'leaderboard.month': { ru: 'Месяц', en: 'Month' },
} as const

type TranslationKey = keyof typeof translations

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || ''  as Lang
  })

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }, [])

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    const entry = translations[key]
    if (!entry) return key
    let text = entry[lang || 'ru'] || entry.ru
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }, [lang])

  // Show language picker if not chosen yet
  if (!lang) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-white px-6">
        <div className="text-6xl mb-6">🧗</div>
        <h1 className="text-2xl font-bold mb-1">Тамгалы-Тас</h1>
        <p className="text-gray-400 text-sm mb-8">Climbing Guide</p>
        <div className="flex gap-4 w-full max-w-xs">
          <button
            onClick={() => setLang('ru')}
            className="flex-1 bg-blue-600 text-white rounded-xl py-4 text-lg font-medium"
          >
            Русский
          </button>
          <button
            onClick={() => setLang('en')}
            className="flex-1 bg-gray-100 text-gray-800 rounded-xl py-4 text-lg font-medium"
          >
            English
          </button>
        </div>
      </div>
    )
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
