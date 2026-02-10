# Frontend (React + Clerk)

This frontend uses Clerk for authentication and calls the FastAPI backend with a Clerk bearer token.

## 1) Configure environment

Copy and edit:

```bash
cp .env.example .env
```

Set:

- `VITE_CLERK_PUBLISHABLE_KEY` to your Clerk publishable key
- `VITE_CLERK_JWT_TEMPLATE` to your Clerk JWT template name (optional but recommended)
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

- Landing page + signed-out Clerk `Sign up` / `Sign in` flows
- Signed-in app workspace powered by `assistant-ui`
- Streaming chat integration with backend `POST /api/v1/chat/stream`
- Tool-call cards rendered inline from stream events
