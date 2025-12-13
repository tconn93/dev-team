import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

export async function initDatabase(dbPath = './data/agent.db') {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(dbPath), { recursive: true });

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Run migrations
    const migration = await fs.readFile(
        path.join(__dirname, 'migrations', '001_initial.sql'),
        'utf-8'
    );
    await db.exec(migration);

    console.log('Database initialized:', dbPath);
    return db;
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

export { db };
