# Frontend (React + Clerk)

This frontend uses Clerk for authentication and calls the FastAPI backend with a Clerk bearer token.

## 1) Configure environment

Copy and edit:

```bash
cp .env.example .env
```

Set:

- `VITE_CLERK_PUBLISHABLE_KEY` to your Clerk publishable key
- `VITE_API_BASE_URL` to your backend base URL (default `http://localhost:8000`)

## 2) Install dependencies

```bash
npm install
```

## 3) Run frontend

```bash
npm run dev
```

## What is implemented

- Signed-out state shows Clerk `Sign up` and `Sign in` modal buttons
- Signed-in state shows `UserButton`
- `Load /api/v1/users/me` sends `Authorization: Bearer <clerk_token>` to backend
