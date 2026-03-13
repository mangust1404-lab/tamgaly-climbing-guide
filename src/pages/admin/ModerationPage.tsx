import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Suggestion } from '../../lib/db/schema'
import { useI18n } from '../../lib/i18n'

export function ModerationPage() {
  const { t } = useI18n()

  const pending = useLiveQuery(
    () => db.suggestions.where('status').equals('pending').reverse().sortBy('createdAt'),
  )

  const handleApprove = async (s: Suggestion) => {
    if (s.type === 'photo') {
      // Create a new topo from the photo
      const topoCount = await db.topos.where('sectorId').equals(s.sectorId).count()
      await db.topos.add({
        id: `topo-${Date.now()}`,
        sectorId: s.sectorId,
        imageUrl: s.data,
        imageWidth: 0,
        imageHeight: 0,
        type: 'topo',
        sortOrder: topoCount + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else if (s.type === 'route') {
      const info = JSON.parse(s.data) as { name: string; grade: string; type: string }
      const gradeSort = gradeToSort(info.grade)
      await db.routes.add({
        id: `route-${Date.now()}`,
        sectorId: s.sectorId,
        name: info.name,
        slug: info.name.toLowerCase().replace(/\s+/g, '-'),
        grade: info.grade,
        gradeSystem: 'french',
        gradeSort,
        pitches: 1,
        routeType: (info.type || 'sport') as any,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    await db.suggestions.update(s.id, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
    })
  }

  const handleReject = async (s: Suggestion) => {
    await db.suggestions.update(s.id, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">{t('admin.moderation')}</h1>

      {(!pending || pending.length === 0) ? (
        <p className="text-gray-400 text-sm">{t('admin.noPending')}</p>
      ) : (
        <div className="space-y-3">
          {pending.map(s => {
            const sectorName = <SectorLabel sectorId={s.sectorId} />
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.type === 'photo' ? 'bg-purple-100 text-purple-700' :
                    s.type === 'route' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {s.type}
                  </span>
                  <span className="text-sm font-medium">{s.userName}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-xs text-gray-500 mb-1">{sectorName}</div>

                {s.type === 'photo' && (
                  <img src={s.data} alt="Suggestion" className="w-full rounded-lg mb-2 max-h-48 object-cover" />
                )}

                {s.type === 'route' && (() => {
                  const info = JSON.parse(s.data)
                  return (
                    <div className="text-sm mb-2">
                      <span className="font-mono font-bold text-blue-700">{info.grade}</span>{' '}
                      {info.name}
                    </div>
                  )
                })()}

                {s.comment && (
                  <p className="text-xs text-gray-500 italic mb-2">{s.comment}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(s)}
                    className="flex-1 bg-green-600 text-white rounded-lg py-1.5 text-sm font-medium"
                  >
                    {t('admin.approve')}
                  </button>
                  <button
                    onClick={() => handleReject(s)}
                    className="flex-1 bg-red-100 text-red-700 rounded-lg py-1.5 text-sm font-medium"
                  >
                    {t('admin.reject')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectorLabel({ sectorId }: { sectorId: string }) {
  const sector = useLiveQuery(() => db.sectors.get(sectorId), [sectorId])
  return <>{sector?.name || sectorId}</>
}

function gradeToSort(grade: string): number {
  const grades = [
    '4', '4a', '4b', '4c',
    '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+',
    '8a', '8a+',
  ]
  const idx = grades.indexOf(grade)
  return idx >= 0 ? (idx + 1) * 15 : 100
}
