# Bench Manager

A local-first web application for discovering, monitoring, and controlling [Frappe](https://frappeframework.com/) bench installations. It runs as a local service on WSL2 (or any Linux environment) and is accessed through a browser.

**Features:**

- Auto-discovers all bench installations under a configurable root directory
- Dashboard with real-time running/stopped status for every bench
- Start, stop, and restart benches without opening a terminal
- Create new benches via a guided wizard with live log streaming (xterm.js)
- Create and drop sites, install apps — all from the UI
- Reusable bench templates (Frappe version + app list) for one-click setup
- WebSocket-powered live output for long-running operations
- Settings page for scan directory, excluded paths, polling interval, and app registry
- Light and dark mode

---

## Prerequisites

| Dependency | Version | Notes                                      |
| ---------- | ------- | ------------------------------------------ |
| Python     | 3.11+   | Backend runtime                            |
| Node.js    | 18+     | Frontend build toolchain                   |
| pnpm       | 9+      | Package manager (`npm install -g pnpm`)    |
| MariaDB    | 10.6+   | Required by Frappe benches you manage      |
| Redis      | 6+      | Required by Frappe benches you manage      |
| Frappe CLI | `bench` | Must be installed and available on `$PATH` |

> Bench Manager itself does not use MariaDB or Redis directly — they are prerequisites of the Frappe benches it manages.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/omarjabr/bench-manager.git
cd bench-manager
```

### 2. Backend setup

```bash
cd backend

# Create a virtual environment
python3.11 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Optionally create a `backend/.env` file to override defaults:

```env
ROOT_SCAN_DIR=~
SCAN_INTERVAL_SECONDS=60
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_mariadb_root_password
```

### 3. Frontend setup

```bash
cd frontend
pnpm install
```

---

## Running

### Option A — Run both services together (recommended)

From the project root:

```bash
pnpm install   # one-time: installs concurrently
pnpm dev
```

This starts the backend on `http://localhost:8000` and the frontend on `http://localhost:5173` side by side.

### Option B — Run each service separately

**Backend** (from `backend/`):

```bash
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (from `frontend/`):

```bash
pnpm dev
```

### Open the app

Navigate to **http://localhost:5173** in your browser.

---

## Project Structure

```
bench-manager/
├── backend/                 # FastAPI backend
│   ├── main.py              # App entry point
│   ├── config.py            # Settings (pydantic-settings)
│   ├── database.py          # SQLite + SQLModel setup
│   ├── models/              # Pydantic + SQLModel models
│   ├── routes/              # Thin route handlers
│   ├── services/            # Business logic
│   ├── ws/                  # WebSocket connection manager
│   └── tests/               # pytest test suite
│
├── frontend/                # React + Vite SPA
│   └── src/
│       ├── pages/           # Route-level components
│       ├── components/      # Reusable UI components
│       ├── hooks/           # React Query + custom hooks
│       ├── lib/             # API client, WebSocket helpers
│       ├── schemas/         # Zod validation schemas
│       └── stores/          # Zustand (UI state only)
│
├── PRD.md                   # Product Requirements Document
└── package.json             # Root scripts (concurrent dev)
```

---

## Tech Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Backend  | FastAPI, SQLModel (SQLite), psutil, watchdog, asyncio   |
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui (Nova), Zustand |
| Forms    | react-hook-form + zod                                   |
| Data     | TanStack React Query                                    |
| Terminal | xterm.js (WebSocket log streaming)                      |
| Icons    | HugeIcons (`@hugeicons/react`)                          |

---

## API Overview

| Method | Path                          | Description                 |
| ------ | ----------------------------- | --------------------------- |
| `GET`  | `/api/benches`                | List all discovered benches |
| `GET`  | `/api/benches/{name}`         | Bench detail                |
| `POST` | `/api/benches/{name}/start`   | Start a bench               |
| `POST` | `/api/benches/{name}/stop`    | Stop a bench                |
| `POST` | `/api/benches/{name}/restart` | Restart a bench             |
| `GET`  | `/api/templates`              | List templates              |
| `POST` | `/api/operations/init`        | Create a new bench          |
| `POST` | `/api/operations/get-app`     | Install an app into a bench |
| `GET`  | `/api/settings`               | Get settings                |
| `PUT`  | `/api/settings`               | Update settings             |
| `GET`  | `/health`                     | Liveness check              |

**WebSocket endpoints:**

- `ws://localhost:8000/ws/benches` — real-time bench status updates
- `ws://localhost:8000/ws/operations/{id}` — live log streaming for operations

---

## Testing

**Backend:**

```bash
cd backend
source venv/bin/activate
pytest
```

**Frontend:**

```bash
cd frontend
pnpm test
```

---

## License

Private — not currently published under an open-source license.
