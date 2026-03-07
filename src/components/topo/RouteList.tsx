import type { Route, TopoRoute } from '../../lib/db/schema'

interface RouteListProps {
  topoRoutes: (TopoRoute & { route?: Route })[]
  selectedRouteId: string | null
  onSelect: (routeId: string) => void
}

export function RouteList({ topoRoutes, selectedRouteId, onSelect }: RouteListProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-1 scrollbar-none">
      {topoRoutes.map((tr) => {
        const route = tr.route
        if (!route) return null
        const isSelected = tr.routeId === selectedRouteId

        return (
          <button
            key={tr.routeId}
            onClick={() => onSelect(tr.routeId)}
            className={`flex-shrink-0 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tr.color || '#FF4444' }}
            />
            <span className="font-mono font-bold text-xs">{route.grade}</span>
            <span className="truncate max-w-[120px]">{route.name}</span>
          </button>
        )
      })}
    </div>
  )
}
