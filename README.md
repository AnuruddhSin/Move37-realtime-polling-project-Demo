# Move37 — Realtime Polls (Advanced)

This is an enhanced implementation of the Move37 real-time polling challenge.
Original challenge file: Voting.pdf.

## What I added (advanced features)
- JWT-based authentication (register/login).
- Role support: USER and ADMIN. Seed admin user: `alice@example.com` / `password`.
- Protected endpoints: creating polls & voting require authentication.
- Admin endpoints: publish, close polls; list voters for a poll.
- Poll scheduling: optional `publishAt` datetime on poll creation. Polls auto-publish when time reached (cron job).
- Poll closing prevents future votes.
- Search & pagination for polls (query params `q`, `page`, `limit`).
- Rate limiting on API.
- WebSockets (Socket.IO) for live vote updates and poll close events.
- Dockerfiles + docker-compose to run DB + backend + frontend.
- Clean modern frontend UI (React + Vite) with login, create poll, realtime vote counts, admin controls.

## Quick start (local, recommended)
Requirements: Node 18+, npm, Docker (optional).

1. Unzip and open the folder:
   ```bash
   cd move37
   ```

2. Start Postgres with Docker Compose:
   ```bash
   docker compose up --build -d
   ```

3. Backend: run migrations & seed (either locally or inside container)
   ```bash
   cd backend
   npm install
   cp .env.example .env
   npx prisma generate
   npx prisma migrate dev --name init
   npm run seed
   npm run dev
   ```
   Backend listens on `http://localhost:4000`.

4. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend (Vite) usually shows `http://localhost:5173`.

## Important notes
- After updating Prisma schema, run the migration commands above.
- The seed creates an admin user (alice@example.com / password).
- To create polls programmatically use the `/api/polls` endpoint with Authorization header `Bearer <token>`.

## Extra: Full CRUD
The backend now supports updating and deleting polls and poll options via these endpoints (creator or ADMIN):

- PUT /api/polls/:id  (update poll question/options/isPublished/publishAt)
- DELETE /api/polls/:id  (delete poll, removes votes/options)
- PUT /api/polls/:id/options/:optionId  (update option text)
- DELETE /api/polls/:id/options/:optionId  (delete option)

Use the admin account `alice@example.com` / `password` for testing admin features.
