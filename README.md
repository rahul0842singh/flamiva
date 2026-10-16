# Flamiva API

Node.js / Express backend with MongoDB Atlas and Clerk authentication.

## Render deployment
Connect this repository as a **Web Service**:
- Root directory: leave blank
- Build: npm ci --omit=dev
- Start: npm run server
- Health check: /api/health
- Free plan is configured in render.yaml; inactive free services may sleep.

Add these environment variables in Render (use your actual values):
MONGODB_URI, MONGODB_DB=flamiva, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
ADMIN_USER_IDS, ALLOWED_ORIGINS, NODE_ENV=production, NODE_VERSION=22.22.0.

ALLOWED_ORIGINS is a comma-separated list of frontend origins, without trailing slashes.
Add Render outbound IP ranges to MongoDB Atlas Network Access.
Render supplies PORT. Do not seed an existing store during deployment.
Never commit .env or secret keys.

Once deployed, build the separately hosted React frontend with:
VITE_API_URL=https://YOUR-SERVICE.onrender.com/api

## Local development
Copy .env.example to .env and fill in the values.
Run npm ci, npm test, then npm run server.

## Structure
- server/: API routes, authentication, database operations and tests
- src/commerceModel.js: shared commerce rules used by the backend
- src/bulkModel.js: bulk enquiry validation
- render.yaml: Render Blueprint configuration

The React UI and image assets are maintained separately. Product image paths returned
by this API refer to assets served by that frontend.

API groups: /api/store, /api/orders, /api/bulk-enquiries, /api/admin/state,
and /api/admin/bulk-enquiries. Admin routes require a verified Clerk user ID
in ADMIN_USER_IDS. Payments and shipping integrations are not connected.
