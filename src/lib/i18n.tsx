import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Lang = 'ru' | 'en' | 'kk'

const LANG_FLAGS: Record<Lang, string> = {
  ru: '\u{1F1F7}\u{1F1FA}',
  en: '\u{1F1EC}\u{1F1E7}',
  kk: '\u{1F1F0}\u{1F1FF}',
}

const LANG_CYCLE: Lang[] = ['ru', 'en', 'kk']

export { LANG_FLAGS, LANG_CYCLE }

const translations = {
  // Navigation
  'nav.home': { ru: 'Главная', en: 'Home', kk: 'Басты бет' },
  'nav.map': { ru: 'Карта', en: 'Map', kk: 'Карта' },
  'nav.leaderboard': { ru: 'Рейтинг', en: 'Leaderboard', kk: 'Рейтинг' },
  'nav.profile': { ru: 'Профиль', en: 'Profile', kk: 'Профиль' },

  // Status bar
  'status.offline': { ru: 'Офлайн', en: 'Offline', kk: 'Офлайн' },
  'status.pending': { ru: '{n} ожидает синхронизации', en: '{n} pending sync', kk: '{n} синхрондауды күтуде' },
  'status.syncing': { ru: 'Синхронизация...', en: 'Syncing...', kk: 'Синхрондау...' },
  'status.sync': { ru: 'Синхронизировать', en: 'Sync', kk: 'Синхрондау' },

  // Common
  'loading': { ru: 'Загрузка...', en: 'Loading...', kk: 'Жүктелуде...' },
  'save': { ru: 'Сохранить', en: 'Save', kk: 'Сақтау' },
  'saving': { ru: 'Сохранение...', en: 'Saving...', kk: 'Сақталуда...' },
  'cancel': { ru: 'Отмена', en: 'Cancel', kk: 'Болдырмау' },
  'back': { ru: 'Назад', en: 'Back', kk: 'Артқа' },
  'next': { ru: 'Далее', en: 'Next', kk: 'Келесі' },
  'skip': { ru: 'Пропустить', en: 'Skip', kk: 'Өткізу' },

  // Home
  'home.title': { ru: 'Тамгалы-Тас', en: 'Tamgaly-Tas', kk: 'Тамғалы-Тас' },
  'home.subtitle': { ru: 'Скалолазный район, 120 км от Алматы', en: 'Climbing area, 120 km from Almaty', kk: 'Жартасқа өрмелеу ауданы, Алматыдан 120 км' },
  'home.sectors': { ru: 'Секторы', en: 'Sectors', kk: 'Секторлар' },
  'home.routes': { ru: 'маршрутов', en: 'routes', kk: 'маршрут' },
  'home.routesCount': { ru: 'маршрутов', en: 'routes', kk: 'маршрут' },
  'home.sectorsCount': { ru: 'секторов', en: 'sectors', kk: 'сектор' },
  'home.ascentsCount': { ru: 'пролазов', en: 'ascents', kk: 'өрмелеу' },
  'home.openMap': { ru: 'Открыть карту', en: 'Open map', kk: 'Картаны ашу' },
  'home.downloadOffline': { ru: 'Скачать офлайн', en: 'Download offline', kk: 'Офлайн жүктеу' },
  'home.downloading': { ru: 'Загрузка...', en: 'Downloading...', kk: 'Жүктелуде...' },
  'home.updateData': { ru: 'Обновить данные', en: 'Update data', kk: 'Деректерді жаңарту' },
  'home.searchPlaceholder': { ru: 'Поиск маршрута...', en: 'Search route...', kk: 'Маршрут іздеу...' },
  'home.searchResults': { ru: 'Результаты поиска', en: 'Search results', kk: 'Іздеу нәтижелері' },
  'home.routesShort': { ru: 'маршр.', en: 'routes', kk: 'маршр.' },
  'home.noData': { ru: 'Данные ещё не загружены. Подождите пару секунд или нажмите «Скачать офлайн».', en: 'Data not loaded yet. Wait a few seconds or tap "Download offline".', kk: 'Деректер әлі жүктелмеді. Бірнеше секунд күтіңіз немесе «Офлайн жүктеу» басыңыз.' },
  'home.approachMin': { ru: 'мин подход', en: 'min approach', kk: 'мин жақындау' },
  'home.gradeAll': { ru: 'Все', en: 'All', kk: 'Барлығы' },
  'home.gradeFilterResults': { ru: 'Маршруты', en: 'Routes', kk: 'Маршруттар' },
  'home.installApp': { ru: 'Установить приложение на телефон', en: 'Install app on phone', kk: 'Телефонға қолданба орнату' },
  'home.noRoutesInRange': { ru: 'Нет маршрутов в этом диапазоне', en: 'No routes in this range', kk: 'Бұл диапазонда маршрут жоқ' },
  'home.aboutArea': { ru: 'О районе', en: 'About the area', kk: 'Аудан туралы' },

  // About page
  'about.location': { ru: 'Расположение', en: 'Location', kk: 'Орналасуы' },
  'about.locationText': { ru: 'Скальный массив на берегу реки Или, 120 км к северу от Алматы. Координаты: 44.064°N, 76.996°E. Дорога от города — 1.5–2 часа через Капчагай.', en: 'Rock formation on the banks of the Ili River, 120 km north of Almaty. Coordinates: 44.064°N, 76.996°E. Drive from the city takes 1.5–2 hours via Kapchagay.', kk: 'Іле өзенінің жағасындағы жартас массиві, Алматыдан солтүстікке 120 км. Координаттар: 44.064°N, 76.996°E. Қаладан жол — Қапшағай арқылы 1,5–2 сағат.' },
  'about.rock': { ru: 'Порода', en: 'Rock type', kk: 'Тау жынысы' },
  'about.rockText': { ru: 'Вулканический туф. Твёрдая, шершавая порода с «дырами» и рельефом. Хорошее трение для ног, но агрессивна для кожи.', en: 'Volcanic tuff. Hard, rough rock with pockets and features. Good friction for feet, but aggressive on skin.', kk: 'Вулкандық туф. Қатты, кедір-бұдыр жыныс, «тесіктері» мен рельефі бар. Аяққа жақсы үйкеліс, бірақ теріге қатал.' },
  'about.season': { ru: 'Сезон', en: 'Season', kk: 'Маусым' },
  'about.seasonText': { ru: 'Март—май, сентябрь—ноябрь. Летом (июнь–август) слишком жарко (40°C+). Зимой камень холодный, но лазить можно в солнечные дни.', en: 'March–May, September–November. Summer (June–August) is too hot (40°C+). Winter rock is cold, but climbable on sunny days.', kk: 'Наурыз—мамыр, қыркүйек—қараша. Жазда (маусым–тамыз) тым ыстық (40°C+). Қыста тас суық, бірақ күн шуақты күндері өрмелеуге болады.' },
  'about.approach': { ru: 'Подход', en: 'Approach', kk: 'Жақындау' },
  'about.approachText': { ru: 'Два основных сектора: Гавань (ущелье от реки) и Ривёрсайд (скалы вдоль реки к северу). Подход 5–20 минут. Вода и тень есть у реки.', en: 'Two main areas: Gavan (canyon from the river) and Riverside (cliffs along the river to the north). Approach 5–20 minutes. Water and shade available by the river.', kk: 'Екі негізгі аудан: Гавань (өзеннен шатқал) және Риверсайд (солтүстікке қарай өзен бойындағы жартастар). Жақындау 5–20 минут. Өзен жанында су мен көлеңке бар.' },

  // Sector
  'sector.routes': { ru: 'Маршруты', en: 'Routes', kk: 'Маршруттар' },
  'sector.approach': { ru: 'Подход', en: 'Approach', kk: 'Жақындау' },
  'sector.orientation': { ru: 'Ориентация', en: 'Orientation', kk: 'Бағдар' },

  // Route
  'route.logAscent': { ru: 'Залогировать пролаз', en: 'Log ascent', kk: 'Өрмелеуді жазу' },
  'route.review': { ru: 'Отзыв', en: 'Review', kk: 'Пікір' },
  'route.ascents': { ru: 'Пролазы', en: 'Ascents', kk: 'Өрмелеулер' },
  'route.reviews': { ru: 'Отзывы', en: 'Reviews', kk: 'Пікірлер' },
  'route.noAscents': { ru: 'Пока никто не пролез', en: 'No ascents yet', kk: 'Әзірге ешкім өрмелемеді' },
  'route.firstAscent': { ru: 'Первопроход', en: 'First ascent', kk: 'Бірінші өрмелеу' },
  'route.community': { ru: 'Мнение сообщества', en: 'Community opinion', kk: 'Қоғамдастық пікірі' },
  'route.softer': { ru: 'Мягче', en: 'Softer', kk: 'Жеңілірек' },
  'route.harder': { ru: 'Жёстче', en: 'Harder', kk: 'Қиынырақ' },
  'route.fair': { ru: 'В точку', en: 'Fair', kk: 'Дәл' },
  'route.points': { ru: 'очков', en: 'points', kk: 'ұпай' },

  // Ascent form
  'ascent.title': { ru: 'Залогировать пролаз', en: 'Log ascent', kk: 'Өрмелеуді жазу' },
  'ascent.style': { ru: 'Стиль', en: 'Style', kk: 'Стиль' },
  'ascent.date': { ru: 'Дата', en: 'Date', kk: 'Күні' },
  'ascent.rating': { ru: 'Оценка маршрута', en: 'Route rating', kk: 'Маршрут бағасы' },
  'ascent.gradeOpinion': { ru: 'как тебе?', en: 'how does it feel?', kk: 'қалай сезінесің?' },
  'ascent.yourGrade': { ru: 'Твоя оценка категории (необязательно):', en: 'Your grade opinion (optional):', kk: 'Категория бағаңыз (міндетті емес):' },
  'ascent.notes': { ru: 'Заметки', en: 'Notes', kk: 'Жазбалар' },
  'ascent.notesPlaceholder': { ru: 'Комментарий, условия, бета...', en: 'Comment, conditions, beta...', kk: 'Пікір, жағдайлар, бета...' },

  // Styles
  'style.onsight': { ru: 'Онсайт', en: 'Onsight', kk: 'Онсайт' },
  'style.flash': { ru: 'Флэш', en: 'Flash', kk: 'Флэш' },
  'style.redpoint': { ru: 'Редпоинт', en: 'Redpoint', kk: 'Редпоинт' },
  'style.toprope': { ru: 'Топроуп', en: 'Toprope', kk: 'Топроуп' },
  'style.attempt': { ru: 'Попытка', en: 'Attempt', kk: 'Әрекет' },
  'style.onsight.desc': { ru: 'Первая попытка без предварительной информации о маршруте', en: 'First attempt with no prior knowledge of the route', kk: 'Маршрут туралы алдын ала ақпаратсыз бірінші әрекет' },
  'style.flash.desc': { ru: 'Первая попытка, но с предварительной информацией (бета)', en: 'First attempt success with pre-acquired knowledge (beta)', kk: 'Алдын ала ақпаратпен (бета) бірінші сәтті әрекет' },
  'style.redpoint.desc': { ru: 'Чистый пролаз лидером без срывов после предыдущих попыток', en: 'Clean lead without falls after one or more previous attempts', kk: 'Алдыңғы әрекеттерден кейін құлаусыз таза лидер өрмелеу' },

  // Route types
  'routeType.sport': { ru: 'Спорт', en: 'Sport', kk: 'Спорт' },
  'routeType.trad': { ru: 'Трад', en: 'Trad', kk: 'Трад' },
  'routeType.boulder': { ru: 'Боулдер', en: 'Boulder', kk: 'Боулдер' },
  'routeType.multi-pitch': { ru: 'Мультипитч', en: 'Multi-pitch', kk: 'Мультипитч' },

  // Map
  'map.nearest': { ru: 'Ближайший:', en: 'Nearest:', kk: 'Ең жақын:' },
  'map.myPosition': { ru: 'Моя позиция', en: 'My position', kk: 'Менің орным' },

  // Review
  'review.gradeOpinion.Soft': { ru: 'Мягче', en: 'Soft', kk: 'Жеңіл' },
  'review.gradeOpinion.Hard': { ru: 'Жёстче', en: 'Hard', kk: 'Қиын' },
  'review.gradeOpinion.Fair': { ru: 'Норм', en: 'Fair', kk: 'Дәл' },
  'review.pendingSync': { ru: 'ожидает синхр.', en: 'pending sync', kk: 'синхрондауды күтуде' },

  // Leaderboard
  'leaderboard.title': { ru: 'Рейтинг', en: 'Leaderboard', kk: 'Рейтинг' },
  'leaderboard.allTime': { ru: 'Всё время', en: 'All time', kk: 'Барлық уақыт' },
  'leaderboard.season': { ru: 'Сезон', en: 'Season', kk: 'Маусым' },
  'leaderboard.month': { ru: 'Месяц', en: 'Month', kk: 'Ай' },
  'leaderboard.week': { ru: 'Неделя', en: 'Week', kk: 'Апта' },
  'leaderboard.climber': { ru: 'Скалолаз', en: 'Climber', kk: 'Альпинист' },
  'leaderboard.noAscents': { ru: 'Пока нет пролазов', en: 'No ascents yet', kk: 'Әзірге өрмелеу жоқ' },
  'leaderboard.noAscentsHint': { ru: 'Залогируй свой первый маршрут!', en: 'Log your first route!', kk: 'Бірінші маршрутыңызды жазыңыз!' },
  'leaderboard.ascents': { ru: 'пролаз.', en: 'ascents', kk: 'өрмел.' },
  'leaderboard.best': { ru: 'макс', en: 'best', kk: 'макс' },
  'leaderboard.points': { ru: 'очков', en: 'points', kk: 'ұпай' },

  // Sector page
  'sector.notFound': { ru: 'Сектор не найден', en: 'Sector not found', kk: 'Сектор табылмады' },
  'sector.min': { ru: 'мин', en: 'min', kk: 'мин' },
  'sector.markRoutes': { ru: 'Разметить', en: 'Mark routes', kk: 'Белгілеу' },
  'sector.done': { ru: 'Готово', en: 'Done', kk: 'Дайын' },
  'sector.noRoutesInRange': { ru: 'Нет маршрутов в этом диапазоне', en: 'No routes in this range', kk: 'Бұл диапазонда маршрут жоқ' },
  'sector.routesNotLoaded': { ru: 'Маршруты не загружены', en: 'Routes not loaded', kk: 'Маршруттар жүктелмеді' },
  'sector.all': { ru: 'Все', en: 'All', kk: 'Барлығы' },
  'sector.deletePhotoConfirm': { ru: 'Удалить это фото и все размеченные на нём маршруты?', en: 'Delete this photo and all route lines on it?', kk: 'Бұл фотоны және ондағы барлық маршрут сызықтарын жою керек пе?' },
  'sector.noPhoto': { ru: 'Нет фото стены', en: 'No wall photo', kk: 'Қабырға фотосы жоқ' },
  'sector.uploadPhoto': { ru: 'Загрузить фото', en: 'Upload photo', kk: 'Фото жүктеу' },
  'sector.editNumber': { ru: 'Нажмите чтобы изменить номер', en: 'Click to edit number', kk: 'Нөмірді өзгерту үшін басыңыз' },
  'sector.showOnTopo': { ru: 'Показать на фото', en: 'Show on topo', kk: 'Фотода көрсету' },
  'compass.directions': { ru: 'С,СВ,В,ЮВ,Ю,ЮЗ,З,СЗ', en: 'N,NE,E,SE,S,SW,W,NW', kk: 'Сн,СнШ,Ш,ОңШ,Оң,ОңБ,Б,СнБ' },

  // Route page
  'route.notFound': { ru: 'Маршрут не найден', en: 'Route not found', kk: 'Маршрут табылмады' },
  'route.meters': { ru: 'м', en: 'm', kk: 'м' },
  'route.pitchesCount': { ru: 'верёвок', en: 'pitches', kk: 'питч' },
  'route.communityCount': { ru: 'Мнение сообщества ({n})', en: 'Community opinion ({n})', kk: 'Қоғамдастық пікірі ({n})' },
  'route.mostCommon': { ru: 'Чаще всего ставят', en: 'Most common', kk: 'Ең жиі қойылатын' },
  'route.people': { ru: 'чел.', en: 'ppl', kk: 'адам' },
  'route.pendingSync': { ru: 'ожидает синхронизации', en: 'pending sync', kk: 'синхрондауды күтуде' },
  'route.voteGrade': { ru: 'Оценить категорию', en: 'Rate grade', kk: 'Категорияны бағалау' },
  'route.stats': { ru: 'Статистика', en: 'Stats', kk: 'Статистика' },
  'route.successfulAscents': { ru: 'Пролезли', en: 'Sent', kk: 'Өрмелеген' },
  'route.myNotes': { ru: 'Мои заметки', en: 'My notes', kk: 'Менің жазбаларым' },
  'route.notesPlaceholder': { ru: 'Бета, условия, впечатления...', en: 'Beta, conditions, impressions...', kk: 'Бета, жағдайлар, әсерлер...' },
  'route.quickdraws': { ru: 'Оттяжек', en: 'Quickdraws', kk: 'Оттяжка' },
  'route.ropeLength': { ru: 'Верёвка', en: 'Rope', kk: 'Арқан' },
  'terrain.slab': { ru: 'Положилово', en: 'Slab', kk: 'Тақта' },
  'terrain.vertical': { ru: 'Вертикаль', en: 'Vertical', kk: 'Тік' },
  'terrain.overhang': { ru: 'Нависание', en: 'Overhang', kk: 'Асу' },
  'terrain.roof': { ru: 'Потолок', en: 'Roof', kk: 'Төбе' },
  'terrain.chimney': { ru: 'Камин', en: 'Chimney', kk: 'Камин' },
  'hold.crimps': { ru: 'Мизера', en: 'Crimps', kk: 'Мизер' },
  'hold.slopers': { ru: 'Пассивы', en: 'Slopers', kk: 'Слоупер' },
  'hold.pinches': { ru: 'Щипки', en: 'Pinches', kk: 'Шымшу' },
  'hold.sidepulls': { ru: 'Откидки', en: 'Sidepulls', kk: 'Бүйір' },
  'hold.pockets': { ru: 'Карманы', en: 'Pockets', kk: 'Қалта' },
  'hold.jugs': { ru: 'Ручки', en: 'Jugs', kk: 'Тұтқа' },
  'route.suggestInfo': { ru: 'Предложить инфо', en: 'Suggest info', kk: 'Ақпарат ұсыну' },
  'route.suggestSent': { ru: 'Отправлено!', en: 'Sent!', kk: 'Жіберілді!' },

  // Profile page
  'profile.title': { ru: 'Профиль', en: 'Profile', kk: 'Профиль' },
  'profile.subtitle': { ru: 'Локальная статистика пролазов', en: 'Local ascent stats', kk: 'Жергілікті өрмелеу статистикасы' },
  'profile.noAscents': { ru: 'Пока нет пролазов', en: 'No ascents yet', kk: 'Әзірге өрмелеу жоқ' },
  'profile.noAscentsHint': { ru: 'Открой маршрут и залогируй пролаз', en: 'Open a route and log an ascent', kk: 'Маршрутты ашып, өрмелеуді жазыңыз' },
  'profile.points': { ru: 'Очков', en: 'Points', kk: 'Ұпай' },
  'profile.bestGrade': { ru: 'Макс. категория', en: 'Best grade', kk: 'Макс. категория' },
  'profile.ascents': { ru: 'Пролазов', en: 'Ascents', kk: 'Өрмелеу' },
  'profile.pendingSync': { ru: 'Ожидает синхр.', en: 'Pending sync', kk: 'Синхрондауды күтуде' },
  'profile.byStyle': { ru: 'По стилю', en: 'By style', kk: 'Стиль бойынша' },
  'profile.gradePyramid': { ru: 'Пирамида категорий', en: 'Grade pyramid', kk: 'Категория пирамидасы' },
  'profile.welcome': { ru: 'Добро пожаловать!', en: 'Welcome!', kk: 'Қош келдіңіз!' },
  'profile.enterName': { ru: 'Как тебя зовут? Это имя увидят другие участники.', en: 'What\'s your name? Other climbers will see it.', kk: 'Сіздің атыңыз кім? Басқа қатысушылар оны көреді.' },
  'profile.namePlaceholder': { ru: 'Имя или ник', en: 'Name or nickname', kk: 'Аты немесе лақап' },
  'profile.start': { ru: 'Новый', en: 'New', kk: 'Жаңа' },
  'profile.findAccount': { ru: 'Найти', en: 'Find', kk: 'Іздеу' },
  'profile.existingFound': { ru: 'Найден аккаунт', en: 'Account found', kk: 'Аккаунт табылды' },
  'profile.restore': { ru: 'Восстановить', en: 'Restore', kk: 'Қалпына келтіру' },
  'profile.adminTopo': { ru: 'Админ: редактор топо', en: 'Admin: topo editor', kk: 'Админ: топо редакторы' },
  'profile.logAscent': { ru: 'Отметить пролаз', en: 'Log ascent', kk: 'Өрмелеуді жазу' },
  'profile.selectSector': { ru: 'Сектор', en: 'Sector', kk: 'Сектор' },
  'profile.selectRoute': { ru: 'Маршрут', en: 'Route', kk: 'Маршрут' },
  'profile.comment': { ru: 'Комментарий', en: 'Comment', kk: 'Пікір' },
  'profile.commentPlaceholder': { ru: 'Условия, бета, впечатления...', en: 'Conditions, beta, impressions...', kk: 'Жағдайлар, бета, әсерлер...' },
  'profile.saved': { ru: 'Пролаз сохранён!', en: 'Ascent saved!', kk: 'Өрмелеу сақталды!' },
  'profile.updateAscent': { ru: 'Обновить пролаз', en: 'Update ascent', kk: 'Өрмелеуді жаңарту' },
  'profile.duplicateScored': { ru: 'Этот маршрут уже пролезен (онсайт/флеш/редпоинт). Можно добавить только топроуп или попытку.', en: 'This route already has a scored ascent. You can only add toprope or attempt.', kk: 'Бұл маршрутта бағаланған өрмелеу бар. Тек топроуп немесе әрекет қосуға болады.' },
  'profile.ascentHistory': { ru: 'История пролазов', en: 'Ascent history', kk: 'Өрмелеу тарихы' },
  'profile.year': { ru: 'Год', en: 'Year', kk: 'Жыл' },
  'profile.projects': { ru: 'Проекты', en: 'Projects', kk: 'Жобалар' },
  'profile.wishlist': { ru: 'Хочу пролезть', en: 'Wishlist', kk: 'Тілектер' },
  'profile.noProjects': { ru: 'Нет проектов', en: 'No projects', kk: 'Жобалар жоқ' },
  'profile.noProjectsHint': { ru: 'Свайп вправо на маршруте → добавить в проекты', en: 'Swipe right on a route → add to projects', kk: 'Маршрутта оңға сырғыту → жобаларға қосу' },
  'swipe.toProjects': { ru: 'В проекты', en: 'To projects', kk: 'Жобаларға' },
  'swipe.logAscent': { ru: 'Пролаз', en: 'Log ascent', kk: 'Өту' },
  'swipe.addedToProjects': { ru: 'Добавлено в проекты!', en: 'Added to projects!', kk: 'Жобаларға қосылды!' },
  'swipe.removedFromProjects': { ru: 'Убрано из проектов', en: 'Removed from projects', kk: 'Жобалардан алынды' },
  'profile.confirmDelete': { ru: 'Удалить этот пролаз?', en: 'Delete this ascent?', kk: 'Бұл өрмелеуді жою керек пе?' },
  'profile.editProfile': { ru: 'Редактировать профиль', en: 'Edit profile', kk: 'Профильді өзгерту' },

  // Review form
  'review.title': { ru: 'Оставить отзыв', en: 'Leave a review', kk: 'Пікір қалдыру' },
  'review.routeQuality': { ru: 'Качество маршрута', en: 'Route quality', kk: 'Маршрут сапасы' },
  'review.grade': { ru: 'Категория', en: 'Grade', kk: 'Категория' },
  'review.comment': { ru: 'Комментарий', en: 'Comment', kk: 'Пікір' },
  'review.commentPlaceholder': { ru: 'Качество скалы, рекомендации...', en: 'Rock quality, recommendations...', kk: 'Жартас сапасы, ұсыныстар...' },
  'review.submit': { ru: 'Отправить отзыв', en: 'Submit review', kk: 'Пікірді жіберу' },

  // Topo viewer
  'topo.loading': { ru: 'Загрузка топо...', en: 'Loading topo...', kk: 'Топо жүктелуде...' },

  // Suggestions
  'suggest.title': { ru: 'Предложить дополнение', en: 'Suggest addition', kk: 'Толықтыру ұсыну' },
  'suggest.photo': { ru: 'Фото стены', en: 'Wall photo', kk: 'Қабырға фотосы' },
  'suggest.route': { ru: 'Новый маршрут', en: 'New route', kk: 'Жаңа маршрут' },
  'suggest.topoLine': { ru: 'Линия на фото', en: 'Route line on photo', kk: 'Фотодағы маршрут сызығы' },
  'suggest.routeName': { ru: 'Название маршрута', en: 'Route name', kk: 'Маршрут атауы' },
  'suggest.routeGrade': { ru: 'Категория', en: 'Grade', kk: 'Категория' },
  'suggest.comment': { ru: 'Комментарий (необязательно)', en: 'Comment (optional)', kk: 'Пікір (міндетті емес)' },
  'suggest.send': { ru: 'Отправить на проверку', en: 'Submit for review', kk: 'Тексеруге жіберу' },
  'suggest.sent': { ru: 'Отправлено! Администратор проверит.', en: 'Sent! Admin will review.', kk: 'Жіберілді! Әкімші тексереді.' },
  'suggest.pending': { ru: 'На проверке', en: 'Pending review', kk: 'Тексерілуде' },
  'suggest.loginFirst': { ru: 'Сначала укажи имя в Профиле', en: 'Set your name in Profile first', kk: 'Алдымен Профильде атыңызды көрсетіңіз' },
  'suggest.drawHint': { ru: 'Нарисуй линию маршрута на фото', en: 'Draw route line on the photo', kk: 'Фотода маршрут сызығын сызыңыз' },

  // Admin moderation
  'admin.moderation': { ru: 'Модерация', en: 'Moderation', kk: 'Модерация' },
  'admin.noPending': { ru: 'Нет предложений на проверке', en: 'No pending suggestions', kk: 'Тексерілетін ұсыныстар жоқ' },
  'admin.approve': { ru: 'Принять', en: 'Approve', kk: 'Қабылдау' },
  'admin.reject': { ru: 'Отклонить', en: 'Reject', kk: 'Қабылдамау' },

  // Map
  'map.entrance': { ru: 'Вход', en: 'Entrance', kk: 'Кіреберіс' },

  // Activity feed
  'nav.activity': { ru: 'Лента', en: 'Activity', kk: 'Лента' },
  'activity.title': { ru: 'Лента', en: 'Activity', kk: 'Лента' },
  'activity.noActivity': { ru: 'Пока нет пролазов', en: 'No activity yet', kk: 'Әзірге белсенділік жоқ' },
  'activity.searchUser': { ru: 'Поиск по имени...', en: 'Search by name...', kk: 'Аты бойынша іздеу...' },
  'activity.followedOnly': { ru: 'Избранные', en: 'Following', kk: 'Таңдаулылар' },
  'activity.follow': { ru: 'Подписаться', en: 'Follow', kk: 'Жазылу' },
  'activity.unfollow': { ru: 'Отписаться', en: 'Unfollow', kk: 'Жазылудан бас тарту' },
  'activity.unknownUser': { ru: 'Неизвестный', en: 'Unknown', kk: 'Белгісіз' },
  'activity.unknownRoute': { ru: 'Неизвестный маршрут', en: 'Unknown route', kk: 'Белгісіз маршрут' },
} as const

// Data field translations (Russian values from topo-data.json → English / Kazakh)
const dataTranslations: Record<Lang, Record<string, string>> = {
  ru: {}, // Russian is the source language, no translation needed
  en: {
    // Area description
    'Скалолазный район на берегу реки Или, 120 км от Алматы. Туф (вулканическая порода), ~200 маршрутов от 4 до 8a+. Сезон: март—май, сентябрь—ноябрь.':
      'Climbing area on the banks of the Ili River, 120 km from Almaty. Tuff (volcanic rock), ~200 routes from 4 to 8a+. Season: March–May, September–November.',
    // Orientations
    'Запад': 'West',
    'Восток': 'East',
    'Юг': 'South',
    'Север': 'North',
    'Юг/Север': 'South/North',
    'Юго-Запад': 'Southwest',
    'Юго-Восток': 'Southeast',
    'Северо-Запад': 'Northwest',
    'Северо-Восток': 'Northeast',
    // Sun exposure
    'После обеда': 'Afternoon sun',
    'После обеда, жарко': 'Afternoon sun, hot',
    'Утром солнце': 'Morning sun',
    'Весь день солнце': 'Sun all day',
    'Днём солнце': 'Daytime sun',
    'Первое солнце утром': 'First morning sun',
    'Юг — солнце, север — тень': 'South — sun, north — shade',
    // Sector descriptions
    'Над рисунком Будды. Верхний и нижний уровни. 14 маршрутов.': 'Above the Buddha drawing. Upper and lower levels. 14 routes.',
    'Самый дальний сектор Гавани. Два уровня.': 'The farthest sector of Gavan. Two levels.',
    'Сектор между Городом и Серпами.': 'Sector between Gorod and Serpy.',
    'Мультипитчи и трад. Верёвка 60м.': 'Multi-pitches and trad. 60m rope.',
    'Правее Бастиона. Мультипитчи до 8a.': 'Right of Bastion. Multi-pitches up to 8a.',
    'Два маршрута под Висячим Камнем.': 'Two routes under the Hanging Stone.',
    'Справа от входа в Гавань. Два слэба и одна вертикаль.': 'Right of Gavan entrance. Two slabs and one vertical.',
    'Начало Ривёрсайд. Микс трада и спорта.': 'Start of Riverside. Mix of trad and sport.',
    'Трад-сектор с минимумом болтов.': 'Trad sector with minimal bolts.',
    'Длинные сложные вертикали и нависания.': 'Long difficult verticals and overhangs.',
    'Первая скала слева при входе в ущелье. Тёплая ранней весной. 13 маршрутов.': 'First rock on the left at the canyon entrance. Warm in early spring. 13 routes.',
    'Большая скала с валуном наверху. Три мультипитча.': 'Large rock with a boulder on top. Three multi-pitches.',
    'Лёгкие маршруты с «дырами». Первое солнце. 15 маршрутов. Перепробиты 2018.': 'Easy routes with pockets. First sun. 15 routes. Re-bolted 2018.',
    'Южная и северная стороны.': 'South and north faces.',
    '4 свежих маршрута на крепкой породе (2019).': '4 new routes on solid rock (2019).',
    // Sector names
    'Бастион': 'Bastion',
    'Библиотека': 'Library',
    'Енбек': 'Enbek',
    'Город': 'City',
    'Карнизы': 'Cornices',
    'Лаборатория': 'Laboratory',
    'Лев': 'Lion',
    'Пригород': 'Suburb',
    'Ребро Жёсткости': 'Stiffening Rib',
    'Серпы': 'Sickles',
    'Винни-Пух': 'Winnie the Pooh',
    'Висячий Камень': 'Hanging Stone',
    'Яблоки': 'Apples',
    'Заманка': 'Zamanka',
    'Зуб': 'Tooth',
    // Route names
    'Неправильные пчёлы': 'Wrong Bees',
    'Пятачок': 'Piglet',
    'Три щели': 'Three Cracks',
    'Левое ухо ослика Иа': 'Eeyore\'s Left Ear',
    'Правое ухо ослика Иа': 'Eeyore\'s Right Ear',
    'Кролик': 'Rabbit',
    'Дина': 'Dina',
    'Алиса': 'Alice',
    'Бармаглот': 'Jabberwock',
    'Чеширский кот': 'Cheshire Cat',
    'Съешь меня': 'Eat Me',
    'Выпей меня': 'Drink Me',
    'Додо': 'Dodo',
    'Синяя Гусеница': 'Blue Caterpillar',
    'Соня': 'Dormouse',
    'Кристофер Робин': 'Christopher Robin',
    'Мартовский заяц': 'March Hare',
    'Безумный Шляпник': 'Mad Hatter',
    'Тоторо': 'Totoro',
    'Хаул': 'Howl',
    'Навсикая': 'Nausicaa',
    'Правая': 'Right One',
    'Ррр-Мяу': 'Grrr-Meow',
    'Бонифаций': 'Boniface',
    'Разминка': 'Warm-up',
    'Ватрушка': 'Vatrushka',
    'Ловушка для Слонопотама': 'Heffalump Trap',
    'Дамские пальчики': 'Ladyfingers',
    'Шарлотка': 'Charlotte',
    'Блин': 'Pancake',
    'Бублик': 'Bagel',
    'Трубочки с кремом': 'Cream Rolls',
    'Мороженое': 'Ice Cream',
    'Пирожное': 'Pastry',
    'Торт': 'Cake',
    'Не ищи сову': 'Don\'t Look for Owl',
    'Печенка': 'Cookie',
    'Крошка Ру': 'Little Roo',
    'Незавершённый гештальт': 'Unfinished Gestalt',
    'Булочка': 'Bun',
    'Напугай сову': 'Scare the Owl',
    'Найди сову': 'Find the Owl',
    'Мудрости': 'Wisdoms',
    'Выпавший': 'Fallen Out',
    'Коренной': 'Molar',
    'Молочный': 'Milk Tooth',
    'Гришина щель': 'Grisha\'s Crack',
    'Череп и покрышка': 'Skull and Tire',
    'Кенга': 'Kanga',
    'Астериск': 'Asterisk',
    'Крест': 'Cross',
    'Иностранка': 'Foreigner',
    'Почтамт': 'Post Office',
    'Гриб (лев)': 'Mushroom (L)',
    'Гриб (прав)': 'Mushroom (R)',
    'Ми': 'Mi',
    'Теория времени': 'Theory of Time',
    'Архипелаг': 'Archipelago',
    'Планея людей': 'Planet of People',
    'Сова': 'Owl',
    'На дороге': 'On the Road',
    'Ремесло': 'Craft',
    'Сюрприз #2': 'Surprise #2',
    'Щель страха': 'Crack of Fear',
    'Щель боли': 'Crack of Pain',
    'Через карниз': 'Over the Cornice',
    'Мескалито': 'Mescalito',
    'Сюрприз': 'Surprise',
    'Нагваль': 'Nagual',
    'Щель Ратмира': 'Ratmir\'s Crack',
    'Тигра': 'Tigger',
    'Щель с птицами': 'Crack with Birds',
    'Сила безмолвия': 'Power of Silence',
    'Отдельная реальность': 'A Separate Reality',
    'Огонь изнутри': 'The Fire from Within',
    'Ломовая щель': 'Brute Crack',
    'Сказки о силе': 'Tales of Power',
    'Колесо времени': 'The Wheel of Time',
    'Щель ярости': 'Crack of Fury',
    'Червяк': 'Worm',
    'Малый серп': 'Little Sickle',
    'Пятнистый Счастливус': 'Spotted Happius',
    'Белый подтёк': 'White Streak',
    'Щель с ласточками': 'Crack with Swallows',
    'Гнёзда': 'Nests',
    'Слева от бастиона': 'Left of Bastion',
    'Подвиг разведчика': 'Scout\'s Feat',
    'Грибоедовский вальс': 'Griboyedov\'s Waltz',
    'Прямая дорога': 'Straight Road',
    'Поезд': 'Train',
    'Искры': 'Sparks',
    'Шишки': 'Cones',
    'Семья': 'Family',
    'Палата номер шесть': 'Ward No. 6',
    'Лихо': 'Trouble',
    'Время колокольчиков': 'Time of Bells',
    'Верка': 'Verka',
    'Надка': 'Nadka',
    'Любка': 'Lyubka',
    'От винта': 'Full Throttle',
    'Пляши в огне!': 'Dance in Fire!',
    'Пашкина щель': 'Pashka\'s Crack',
  },
  kk: {
    // Area description
    'Скалолазный район на берегу реки Или, 120 км от Алматы. Туф (вулканическая порода), ~200 маршрутов от 4 до 8a+. Сезон: март—май, сентябрь—ноябрь.':
      'Іле өзенінің жағасындағы жартасқа өрмелеу ауданы, Алматыдан 120 км. Туф (вулкандық жыныс), 4-тен 8a+-ге дейін ~200 маршрут. Маусым: наурыз—мамыр, қыркүйек—қараша.',
    // Orientations
    'Запад': 'Батыс',
    'Восток': 'Шығыс',
    'Юг': 'Оңтүстік',
    'Север': 'Солтүстік',
    'Юг/Север': 'Оңтүстік/Солтүстік',
    'Юго-Запад': 'Оңтүстік-Батыс',
    'Юго-Восток': 'Оңтүстік-Шығыс',
    'Северо-Запад': 'Солтүстік-Батыс',
    'Северо-Восток': 'Солтүстік-Шығыс',
    // Sun exposure
    'После обеда': 'Түстен кейін күн',
    'После обеда, жарко': 'Түстен кейін күн, ыстық',
    'Утром солнце': 'Таңертең күн',
    'Весь день солнце': 'Күні бойы күн',
    'Днём солнце': 'Күндіз күн',
    'Первое солнце утром': 'Таңғы алғашқы күн',
    'Юг — солнце, север — тень': 'Оңтүстік — күн, солтүстік — көлеңке',
    // Sector descriptions
    'Над рисунком Будды. Верхний и нижний уровни. 14 маршрутов.': 'Будда суретінің үстінде. Жоғарғы және төменгі деңгейлер. 14 маршрут.',
    'Самый дальний сектор Гавани. Два уровня.': 'Гаваньдің ең алыс секторы. Екі деңгей.',
    'Сектор между Городом и Серпами.': 'Город пен Серптердің арасындағы сектор.',
    'Мультипитчи и трад. Верёвка 60м.': 'Мультипитчтер мен трад. Арқан 60м.',
    'Правее Бастиона. Мультипитчи до 8a.': 'Бастионнан оңға. 8a дейінгі мультипитчтер.',
    'Два маршрута под Висячим Камнем.': 'Ілулі Тастың астында екі маршрут.',
    'Справа от входа в Гавань. Два слэба и одна вертикаль.': 'Гаваньға кіреберістің оң жағында. Екі слэб және бір вертикаль.',
    'Начало Ривёрсайд. Микс трада и спорта.': 'Риверсайдтың басы. Трад пен спорттың қоспасы.',
    'Трад-сектор с минимумом болтов.': 'Болттар аз трад-сектор.',
    'Длинные сложные вертикали и нависания.': 'Ұзын күрделі вертикальдар мен нависаниялар.',
    'Первая скала слева при входе в ущелье. Тёплая ранней весной. 13 маршрутов.': 'Шатқалға кіргенде сол жақтағы бірінші жартас. Ерте көктемде жылы. 13 маршрут.',
    'Большая скала с валуном наверху. Три мультипитча.': 'Үстінде тас бар үлкен жартас. Үш мультипитч.',
    'Лёгкие маршруты с «дырами». Первое солнце. 15 маршрутов. Перепробиты 2018.': 'Тесіктері бар жеңіл маршруттар. Алғашқы күн. 15 маршрут. 2018 жылы қайта болтталған.',
    'Южная и северная стороны.': 'Оңтүстік және солтүстік жақтары.',
    '4 свежих маршрута на крепкой породе (2019).': 'Берік жыныстағы 4 жаңа маршрут (2019).',
    // Sector names
    'Бастион': 'Бастион',
    'Библиотека': 'Кітапхана',
    'Енбек': 'Еңбек',
    'Город': 'Қала',
    'Карнизы': 'Карниздер',
    'Лаборатория': 'Зертхана',
    'Лев': 'Арыстан',
    'Пригород': 'Қала маңы',
    'Ребро Жёсткости': 'Қатаңдық қабырғасы',
    'Серпы': 'Орақтар',
    'Винни-Пух': 'Винни-Пух',
    'Висячий Камень': 'Ілулі Тас',
    'Яблоки': 'Алмалар',
    'Заманка': 'Заманка',
    'Зуб': 'Тіс',
  },
}

type TranslationKey = keyof typeof translations

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  td: (text: string) => string
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
    let text: string = entry[lang || 'ru'] || entry.ru
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }, [lang])

  const td = useCallback((text: string): string => {
    if (lang !== 'ru') {
      const dict = dataTranslations[lang]
      if (dict && dict[text]) return dict[text]
    }
    return text
  }, [lang])

  // Show language picker if not chosen yet
  if (!lang) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-white px-6">
        <div className="text-6xl mb-6">🧗</div>
        <h1 className="text-2xl font-bold mb-1">Тамғалы-Тас</h1>
        <p className="text-gray-400 text-sm mb-8">Climbing Guide</p>
        <div className="flex gap-3 w-full max-w-sm">
          <button
            onClick={() => setLang('ru')}
            className="flex-1 bg-blue-600 text-white rounded-xl py-4 text-lg font-medium flex flex-col items-center gap-1"
          >
            <span className="text-2xl">{LANG_FLAGS.ru}</span>
            <span>Русский</span>
          </button>
          <button
            onClick={() => setLang('kk')}
            className="flex-1 bg-sky-500 text-white rounded-xl py-4 text-lg font-medium flex flex-col items-center gap-1"
          >
            <span className="text-2xl">{LANG_FLAGS.kk}</span>
            <span>Қазақша</span>
          </button>
          <button
            onClick={() => setLang('en')}
            className="flex-1 bg-gray-100 text-gray-800 rounded-xl py-4 text-lg font-medium flex flex-col items-center gap-1"
          >
            <span className="text-2xl">{LANG_FLAGS.en}</span>
            <span>English</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t, td }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
