import Dexie, { type Table } from 'dexie'

// --- Типы данных ---

export interface Area {
  id: string
  name: string
  slug: string
  description?: string
  latitude: number
  longitude: number
  bboxNorth?: number
  bboxSouth?: number
  bboxEast?: number
  bboxWest?: number
  approachInfo?: string
  accessNotes?: string
  elevationM?: number
  rockType?: string
  createdAt: string
  updatedAt: string
}

export interface Sector {
  id: string
  areaId: string
  name: string
  slug: string
  description?: string
  latitude: number
  longitude: number
  approachDescription?: string
  approachTimeMin?: number
  approachGpsTrack?: GeoJSON.LineString
  orientation?: string
  sunExposure?: string
  coverImageUrl?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Route {
  id: string
  sectorId: string
  name: string
  slug: string
  grade: string
  gradeAlt?: string // alternative grade (e.g. trad vs sport)
  gradeSystem: 'french' | 'yds' | 'hueco' | 'british'
  gradeSort: number
  lengthM?: number
  pitches: number
  pitchGrades?: string[] // per-pitch grades for multi-pitch routes
  routeType: 'sport' | 'trad' | 'boulder' | 'multi-pitch'
  description?: string
  protection?: string
  firstAscent?: string
  firstAscentDate?: string
  qualityRating?: number
  numberInSector?: number
  latitude?: number
  longitude?: number
  tags?: string[]
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface Topo {
  id: string
  sectorId: string
  imageUrl: string
  dziBaseUrl?: string
  imageWidth: number
  imageHeight: number
  caption?: string
  photographer?: string
  type?: 'topo' | 'approach'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TopoRoute {
  id: string
  topoId: string
  routeId: string
  svgPath: string
  color: string
  startX: number
  startY: number
  anchorX?: number
  anchorY?: number
  labelX?: number
  labelY?: number
  routeNumber?: number
}

export interface User {
  id: string
  email?: string
  displayName: string
  avatarUrl?: string
  homeArea?: string
  climbingSince?: number
  createdAt: string
  updatedAt: string
}

export interface Ascent {
  id: string
  localId: string
  userId: string
  routeId: string
  date: string
  style: 'onsight' | 'flash' | 'redpoint' | 'toprope' | 'attempt'
  rating?: number
  personalGrade?: string
  notes?: string
  isPublic: boolean
  points: number
  syncStatus: 'pending' | 'synced' | 'error'
  createdAt: string
  syncedAt?: string
}

export interface Review {
  id: string
  localId: string
  userId: string
  routeId: string
  rating: number
  comment?: string
  gradeOpinion?: string
  conditionsNote?: string
  syncStatus: 'pending' | 'synced' | 'error'
  createdAt: string
  syncedAt?: string
}

export interface Achievement {
  id: string
  userId: string
  type: string
  name: string
  description: string
  earnedAt: string
  syncStatus: 'pending' | 'synced' | 'error'
}

export interface Suggestion {
  id: string
  userId: string
  userName: string
  sectorId: string
  type: 'photo' | 'route' | 'topo-line'
  status: 'pending' | 'approved' | 'rejected'
  /** For 'photo': base64 data URL. For 'route': JSON with name/grade/type. For 'topo-line': JSON with topoId + svgPath etc. */
  data: string
  comment?: string
  reviewedBy?: string
  createdAt: string
  reviewedAt?: string
}

export interface SyncQueueItem {
  id?: number
  entity: 'ascent' | 'review' | 'achievement'
  localId: string
  action: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
  lastError?: string
}

export interface SyncMeta {
  key: string
  value: string
}

// --- База данных ---

export class ClimbingDB extends Dexie {
  areas!: Table<Area>
  sectors!: Table<Sector>
  routes!: Table<Route>
  topos!: Table<Topo>
  topoRoutes!: Table<TopoRoute>
  users!: Table<User>
  ascents!: Table<Ascent>
  reviews!: Table<Review>
  achievements!: Table<Achievement>
  suggestions!: Table<Suggestion>
  syncQueue!: Table<SyncQueueItem>
  syncMeta!: Table<SyncMeta>

  constructor() {
    super('tamgaly-climbing-guide')

    this.version(1).stores({
      areas: 'id, slug',
      sectors: 'id, areaId, slug, sortOrder',
      routes: 'id, sectorId, slug, gradeSort, routeType, status',
      topos: 'id, sectorId, sortOrder',
      topoRoutes: 'id, topoId, routeId, [topoId+routeId]',
      users: 'id, email',
      ascents: 'id, localId, routeId, userId, syncStatus, date',
      reviews: 'id, localId, routeId, userId, syncStatus',
      achievements: 'id, userId, type, syncStatus',
      syncQueue: '++id, entity, localId, createdAt',
      syncMeta: 'key',
    })

    this.version(2).stores({
      suggestions: 'id, sectorId, userId, status, type, createdAt',
    })
  }
}

export const db = new ClimbingDB()
