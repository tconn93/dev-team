import crypto from 'crypto';

// Load from environment or generate on startup
const AUTH_TOKEN = process.env.WEB_AUTH_TOKEN || generateToken();

/**
 * Generate a random authentication token
 * @returns {string} - Random hex token
 */
function generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    console.log('\n==============================================');
    console.log('🔐 Generated authentication token (save this!):');
    console.log(token);
    console.log('');
    console.log('Add to .env as: WEB_AUTH_TOKEN=' + token);
    console.log('==============================================\n');
    return token;
}

/**
 * Verify if provided token matches the authentication token
 * @param {string} token - Token to verify
 * @returns {boolean} - True if valid
 */
export function verifyToken(token) {
    if (!token) {
        return false;
    }
    return token === AUTH_TOKEN;
}

/**
 * Express middleware for REST API authentication
 * Checks Authorization header or query parameter
 */
export function authMiddleware(req, res, next) {
    // Extract token from Authorization header or query params
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || req.query.token;

    if (!verifyToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

export { AUTH_TOKEN };
