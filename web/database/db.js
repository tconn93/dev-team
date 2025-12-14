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

    // Create migrations tracking table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
        );
    `);

    // Run all pending migrations
    await runMigrations();

    console.log('Database initialized:', dbPath);
    return db;
}

/**
 * Run all pending database migrations
 */
async function runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');

    // Get all migration files
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
        .filter(f => f.endsWith('.sql'))
        .sort(); // Sort alphabetically to ensure order

    for (const file of migrationFiles) {
        // Check if migration already applied
        const existing = await db.get(
            'SELECT id FROM migrations WHERE name = ?',
            [file]
        );

        if (!existing) {
            console.log(`Running migration: ${file}`);

            // Read and execute migration
            const migrationPath = path.join(migrationsDir, file);
            const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

            try {
                await db.exec(migrationSQL);

                // Record that migration was applied
                await db.run(
                    'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
                    [file, new Date().toISOString()]
                );

                console.log(`✓ Migration ${file} applied successfully`);
            } catch (error) {
                console.error(`✗ Migration ${file} failed:`, error.message);
                throw error;
            }
        }
    }
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

export { db };
