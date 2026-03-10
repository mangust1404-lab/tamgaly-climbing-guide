import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Route, TopoRoute } from '../../lib/db/schema'
import { GradeVoting } from '../route/GradeVoting'
import { AscentForm } from '../route/AscentForm'
import { gradeColor } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'

interface RouteListProps {
  topoRoutes: (TopoRoute & { route?: Route })[]
  selectedRouteId: string | null
  onSelect: (routeId: string | null) => void
}

export function RouteList({ topoRoutes, selectedRouteId, onSelect }: RouteListProps) {
  const { t } = useI18n()
  const [showAscentForm, setShowAscentForm] = useState(false)

  const selectedTr = selectedRouteId
    ? topoRoutes.find(tr => tr.routeId === selectedRouteId)
    : null
  const selectedRoute = selectedTr?.route

  // Selected mode: show one route's details + grade voting + log ascent
  if (selectedRoute && selectedTr) {
    return (
      <div className="px-2 py-1.5">
        {/* Route info row */}
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => onSelect(null)}
            className="text-gray-400 text-sm leading-none"
            title="Show all"
          >
            &larr;
          </button>
          <span
            className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: selectedTr.color || '#FF4444' }}
          >
            {selectedTr.routeNumber}
          </span>
          <span className={`text-xs font-mono font-bold rounded px-1.5 py-0.5 ${gradeColor(selectedRoute.grade)}`}>
            {selectedRoute.grade}
          </span>
          <Link
            to={`/route/${selectedRoute.id}`}
            className="text-sm font-medium truncate text-blue-700"
          >
            {selectedRoute.name}
          </Link>
          <button
            onClick={() => setShowAscentForm(true)}
            className="ml-auto flex-shrink-0 text-[11px] bg-green-600 text-white rounded-full px-2.5 py-1 font-medium"
          >
            {t('route.logAscent')}
          </button>
        </div>
        {/* Grade voting */}
        <GradeVoting route={selectedRoute} compact />
        {/* Ascent form modal */}
        {showAscentForm && (
          <AscentForm
            route={selectedRoute}
            onClose={() => setShowAscentForm(false)}
          />
        )}
      </div>
    )
  }

  // All routes mode: compact numbered circles only
  return (
    <div className="flex flex-wrap gap-1 py-1.5 px-2">
      {topoRoutes.map((tr) => {
        const route = tr.route
        if (!route) return null
        return (
          <button
            key={tr.routeId}
            onClick={() => onSelect(tr.routeId)}
            className="flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-[11px] bg-white border border-gray-200 hover:border-gray-400 transition-colors"
          >
            <span
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
              style={{ backgroundColor: tr.color || '#FF4444' }}
            >
              {tr.routeNumber}
            </span>
            <span className="font-mono font-bold text-gray-600">{route.grade}</span>
          </button>
        )
      })}
    </div>
  )
}
