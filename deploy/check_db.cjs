const db = require('better-sqlite3')('/app/server/data/climbing.db');
console.log('Tables:', JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()));
console.log('Routes:', db.prepare('SELECT COUNT(*) as cnt FROM route').get());
console.log('Ascents:', db.prepare('SELECT COUNT(*) as cnt FROM ascent').get());
console.log('Users:', JSON.stringify(db.prepare('SELECT id, display_name FROM app_user').all()));
