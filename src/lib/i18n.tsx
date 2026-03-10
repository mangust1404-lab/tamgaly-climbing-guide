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
  'home.subtitle': { ru: 'Скалолазный район, 120 км от Алматы', en: 'Climbing area, 120 km from Almaty' },
  'home.sectors': { ru: 'Секторы', en: 'Sectors' },
  'home.routes': { ru: 'маршрутов', en: 'routes' },
  'home.routesCount': { ru: 'маршрутов', en: 'routes' },
  'home.sectorsCount': { ru: 'секторов', en: 'sectors' },
  'home.ascentsCount': { ru: 'пролазов', en: 'ascents' },
  'home.openMap': { ru: 'Открыть карту', en: 'Open map' },
  'home.downloadOffline': { ru: 'Скачать офлайн', en: 'Download offline' },
  'home.downloading': { ru: 'Загрузка...', en: 'Downloading...' },
  'home.updateData': { ru: 'Обновить данные', en: 'Update data' },
  'home.searchPlaceholder': { ru: 'Поиск маршрута...', en: 'Search route...' },
  'home.searchResults': { ru: 'Результаты поиска', en: 'Search results' },
  'home.routesShort': { ru: 'маршр.', en: 'routes' },
  'home.noData': { ru: 'Данные ещё не загружены. Подождите пару секунд или нажмите «Скачать офлайн».', en: 'Data not loaded yet. Wait a few seconds or tap "Download offline".' },
  'home.approachMin': { ru: 'мин подход', en: 'min approach' },
  'home.gradeAll': { ru: 'Все', en: 'All' },
  'home.gradeFilterResults': { ru: 'Маршруты', en: 'Routes' },
  'home.noRoutesInRange': { ru: 'Нет маршрутов в этом диапазоне', en: 'No routes in this range' },
  'home.aboutArea': { ru: 'О районе', en: 'About the area' },

  // About page
  'about.location': { ru: 'Расположение', en: 'Location' },
  'about.locationText': { ru: 'Скальный массив на берегу реки Или, 120 км к северу от Алматы. Координаты: 44.064°N, 76.996°E. Дорога от города — 1.5–2 часа через Капчагай.', en: 'Rock formation on the banks of the Ili River, 120 km north of Almaty. Coordinates: 44.064°N, 76.996°E. Drive from the city takes 1.5–2 hours via Kapchagay.' },
  'about.rock': { ru: 'Порода', en: 'Rock type' },
  'about.rockText': { ru: 'Вулканический туф. Твёрдая, шершавая порода с «дырами» и рельефом. Хорошее трение для ног, но агрессивна для кожи.', en: 'Volcanic tuff. Hard, rough rock with pockets and features. Good friction for feet, but aggressive on skin.' },
  'about.season': { ru: 'Сезон', en: 'Season' },
  'about.seasonText': { ru: 'Март—май, сентябрь—ноябрь. Летом (июнь–август) слишком жарко (40°C+). Зимой камень холодный, но лазить можно в солнечные дни.', en: 'March–May, September–November. Summer (June–August) is too hot (40°C+). Winter rock is cold, but climbable on sunny days.' },
  'about.approach': { ru: 'Подход', en: 'Approach' },
  'about.approachText': { ru: 'Два основных сектора: Гавань (ущелье от реки) и Ривёрсайд (скалы вдоль реки к северу). Подход 5–20 минут. Вода и тень есть у реки.', en: 'Two main areas: Gavan (canyon from the river) and Riverside (cliffs along the river to the north). Approach 5–20 minutes. Water and shade available by the river.' },

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
  'style.onsight.desc': { ru: 'Первая попытка без предварительной информации о маршруте', en: 'First attempt with no prior knowledge of the route' },
  'style.flash.desc': { ru: 'Первая попытка, но с предварительной информацией (бета)', en: 'First attempt success with pre-acquired knowledge (beta)' },
  'style.redpoint.desc': { ru: 'Чистый пролаз лидером без срывов после предыдущих попыток', en: 'Clean lead without falls after one or more previous attempts' },

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
  'leaderboard.week': { ru: 'Неделя', en: 'Week' },
  'leaderboard.climber': { ru: 'Скалолаз', en: 'Climber' },
  'leaderboard.noAscents': { ru: 'Пока нет пролазов', en: 'No ascents yet' },
  'leaderboard.noAscentsHint': { ru: 'Залогируй свой первый маршрут!', en: 'Log your first route!' },
  'leaderboard.ascents': { ru: 'пролаз.', en: 'ascents' },
  'leaderboard.best': { ru: 'макс', en: 'best' },
  'leaderboard.points': { ru: 'очков', en: 'points' },

  // Sector page
  'sector.notFound': { ru: 'Сектор не найден', en: 'Sector not found' },
  'sector.min': { ru: 'мин', en: 'min' },
  'sector.markRoutes': { ru: 'Разметить', en: 'Mark routes' },
  'sector.done': { ru: 'Готово', en: 'Done' },
  'sector.noRoutesInRange': { ru: 'Нет маршрутов в этом диапазоне', en: 'No routes in this range' },
  'sector.routesNotLoaded': { ru: 'Маршруты не загружены', en: 'Routes not loaded' },
  'sector.all': { ru: 'Все', en: 'All' },
  'sector.deletePhotoConfirm': { ru: 'Удалить это фото и все размеченные на нём маршруты?', en: 'Delete this photo and all route lines on it?' },
  'sector.noPhoto': { ru: 'Нет фото стены', en: 'No wall photo' },
  'sector.uploadPhoto': { ru: 'Загрузить фото', en: 'Upload photo' },
  'sector.editNumber': { ru: 'Нажмите чтобы изменить номер', en: 'Click to edit number' },
  'compass.directions': { ru: 'С,СВ,В,ЮВ,Ю,ЮЗ,З,СЗ', en: 'N,NE,E,SE,S,SW,W,NW' },

  // Route page
  'route.notFound': { ru: 'Маршрут не найден', en: 'Route not found' },
  'route.meters': { ru: 'м', en: 'm' },
  'route.pitchesCount': { ru: 'верёвок', en: 'pitches' },
  'route.communityCount': { ru: 'Мнение сообщества ({n})', en: 'Community opinion ({n})' },
  'route.mostCommon': { ru: 'Чаще всего ставят', en: 'Most common' },
  'route.people': { ru: 'чел.', en: 'ppl' },
  'route.pendingSync': { ru: 'ожидает синхронизации', en: 'pending sync' },
  'route.voteGrade': { ru: 'Оценить категорию', en: 'Rate grade' },

  // Profile page
  'profile.title': { ru: 'Профиль', en: 'Profile' },
  'profile.subtitle': { ru: 'Локальная статистика пролазов', en: 'Local ascent stats' },
  'profile.noAscents': { ru: 'Пока нет пролазов', en: 'No ascents yet' },
  'profile.noAscentsHint': { ru: 'Открой маршрут и залогируй пролаз', en: 'Open a route and log an ascent' },
  'profile.points': { ru: 'Очков', en: 'Points' },
  'profile.bestGrade': { ru: 'Макс. категория', en: 'Best grade' },
  'profile.ascents': { ru: 'Пролазов', en: 'Ascents' },
  'profile.pendingSync': { ru: 'Ожидает синхр.', en: 'Pending sync' },
  'profile.byStyle': { ru: 'По стилю', en: 'By style' },
  'profile.gradePyramid': { ru: 'Пирамида категорий', en: 'Grade pyramid' },
  'profile.adminTopo': { ru: 'Админ: редактор топо', en: 'Admin: topo editor' },
  'profile.logAscent': { ru: 'Отметить пролаз', en: 'Log ascent' },
  'profile.selectSector': { ru: 'Сектор', en: 'Sector' },
  'profile.selectRoute': { ru: 'Маршрут', en: 'Route' },
  'profile.comment': { ru: 'Комментарий', en: 'Comment' },
  'profile.commentPlaceholder': { ru: 'Условия, бета, впечатления...', en: 'Conditions, beta, impressions...' },
  'profile.saved': { ru: 'Пролаз сохранён!', en: 'Ascent saved!' },

  // Review form
  'review.title': { ru: 'Оставить отзыв', en: 'Leave a review' },
  'review.routeQuality': { ru: 'Качество маршрута', en: 'Route quality' },
  'review.grade': { ru: 'Категория', en: 'Grade' },
  'review.comment': { ru: 'Комментарий', en: 'Comment' },
  'review.commentPlaceholder': { ru: 'Качество скалы, рекомендации...', en: 'Rock quality, recommendations...' },
  'review.submit': { ru: 'Отправить отзыв', en: 'Submit review' },

  // Topo viewer
  'topo.loading': { ru: 'Загрузка топо...', en: 'Loading topo...' },

  // Map
  'map.entrance': { ru: 'Вход', en: 'Entrance' },
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
