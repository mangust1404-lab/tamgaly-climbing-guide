/**
 * Create database tables. Run once:
 *   npx tsx server/src/db/migrate.ts
 */

import { getDb } from './connection'
import { mkdirSync } from 'fs'
import { join } from 'path'

// Ensure data directory exists
mkdirSync(join(process.cwd(), 'server', 'data'), { recursive: true })

const db = getDb()

db.exec(`
  CREATE TABLE IF NOT EXISTS area (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    bbox_north REAL,
    bbox_south REAL,
    bbox_east REAL,
    bbox_west REAL,
    approach_info TEXT,
    access_notes TEXT,
    elevation_m INTEGER,
    rock_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sector (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL REFERENCES area(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    approach_description TEXT,
    approach_time_min INTEGER,
    approach_gps_track TEXT,
    orientation TEXT,
    sun_exposure TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(area_id, slug)
  );

  CREATE TABLE IF NOT EXISTS route (
    id TEXT PRIMARY KEY,
    sector_id TEXT NOT NULL REFERENCES sector(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    grade TEXT NOT NULL,
    grade_system TEXT DEFAULT 'french',
    grade_sort INTEGER,
    length_m REAL,
    pitches INTEGER DEFAULT 1,
    route_type TEXT NOT NULL,
    description TEXT,
    protection TEXT,
    first_ascent TEXT,
    first_ascent_date TEXT,
    quality_rating REAL,
    number_in_sector INTEGER,
    latitude REAL,
    longitude REAL,
    tags TEXT,
    status TEXT DEFAULT 'published',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(sector_id, slug)
  );

  CREATE TABLE IF NOT EXISTS topo (
    id TEXT PRIMARY KEY,
    sector_id TEXT NOT NULL REFERENCES sector(id),
    image_url TEXT NOT NULL,
    dzi_base_url TEXT,
    image_width INTEGER NOT NULL,
    image_height INTEGER NOT NULL,
    caption TEXT,
    photographer TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS topo_route (
    id TEXT PRIMARY KEY,
    topo_id TEXT NOT NULL REFERENCES topo(id),
    route_id TEXT NOT NULL REFERENCES route(id),
    svg_path TEXT NOT NULL,
    color TEXT DEFAULT '#FF0000',
    start_x REAL NOT NULL,
    start_y REAL NOT NULL,
    anchor_x REAL,
    anchor_y REAL,
    label_x REAL,
    label_y REAL,
    route_number INTEGER,
    UNIQUE(topo_id, route_id)
  );

  CREATE TABLE IF NOT EXISTS app_user (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    home_area TEXT,
    climbing_since INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ascent (
    id TEXT PRIMARY KEY,
    local_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    route_id TEXT NOT NULL REFERENCES route(id),
    date TEXT NOT NULL,
    style TEXT NOT NULL,
    rating REAL,
    personal_grade TEXT,
    notes TEXT,
    is_public INTEGER DEFAULT 1,
    points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS review (
    id TEXT PRIMARY KEY,
    local_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    route_id TEXT NOT NULL REFERENCES route(id),
    rating REAL NOT NULL,
    comment TEXT,
    grade_opinion TEXT,
    conditions_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sector_area ON sector(area_id);
  CREATE INDEX IF NOT EXISTS idx_route_sector ON route(sector_id);
  CREATE INDEX IF NOT EXISTS idx_route_grade ON route(grade_sort);
  CREATE INDEX IF NOT EXISTS idx_topo_sector ON topo(sector_id);
  CREATE INDEX IF NOT EXISTS idx_ascent_route ON ascent(route_id);
  CREATE INDEX IF NOT EXISTS idx_ascent_user ON ascent(user_id);
  CREATE INDEX IF NOT EXISTS idx_review_route ON review(route_id);
`)

console.log('Database tables created successfully.')
