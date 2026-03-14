import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/schema'
import { useI18n } from '../lib/i18n'

export function AboutPage() {
  const { t, td } = useI18n()
  const area = useLiveQuery(() => db.areas.get('tamgaly-tas'))
  const routes = useLiveQuery(() => db.routes.count())
  const sectors = useLiveQuery(() => db.sectors.count())
  const ascents = useLiveQuery(() => db.ascents.count())

  return (
    <div className="p-4">
      <Link to="/" className="text-blue-600 text-xs">&larr; {t('back')}</Link>
      <h1 className="text-2xl font-bold mt-2 mb-3">{t('home.title')}</h1>

      <p className="text-sm text-gray-700 mb-4 leading-relaxed">
        {area?.description ? td(area.description) : t('home.subtitle')}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{routes ?? 0}</div>
          <div className="text-xs text-blue-600">{t('home.routesCount')}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-green-700">{sectors ?? 0}</div>
          <div className="text-xs text-green-600">{t('home.sectorsCount')}</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-purple-700">{ascents ?? 0}</div>
          <div className="text-xs text-purple-600">{t('home.ascentsCount')}</div>
        </div>
      </div>

      <div className="space-y-3 text-sm text-gray-600">
        <div>
          <h2 className="font-semibold text-gray-800 mb-1">{t('about.location')}</h2>
          <p>{t('about.locationText')}</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-800 mb-1">{t('about.rock')}</h2>
          <p>{t('about.rockText')}</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-800 mb-1">{t('about.season')}</h2>
          <p>{t('about.seasonText')}</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-800 mb-1">{t('about.approach')}</h2>
          <p>{t('about.approachText')}</p>
        </div>
      </div>
    </div>
  )
}
