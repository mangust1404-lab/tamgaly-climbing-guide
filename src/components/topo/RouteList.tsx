import type { Route, TopoRoute } from '../../lib/db/schema'

interface RouteListProps {
  topoRoutes: (TopoRoute & { route?: Route })[]
  selectedRouteId: string | null
  onSelect: (routeId: string | null) => void
}

export function RouteList({ topoRoutes, selectedRouteId, onSelect }: RouteListProps) {
  return (
    <div className="flex flex-wrap gap-1.5 py-2 px-1">
      {topoRoutes.map((tr) => {
        const route = tr.route
        if (!route) return null
        const isSelected = tr.routeId === selectedRouteId

        return (
          <button
            key={tr.routeId}
            onClick={() => onSelect(isSelected ? null : tr.routeId)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            <span
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
              style={{ backgroundColor: tr.color || '#FF4444' }}
            >
              {tr.routeNumber}
            </span>
            <span className="font-mono font-bold">{route.grade}</span>
            <span className="truncate max-w-[100px]">{route.name}</span>
          </button>
        )
      })}
    </div>
  )
}
