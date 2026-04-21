# Bench Manager — Product Requirements Document

**Version:** 1.0  
**Phase:** V1 — Local Bench Management  
**Status:** V1 Complete  
**Tagged:** `v1.0.0`

---

## 1. Overview

### 1.1 Problem Statement

Frappe/ERPNext developers managing multiple bench installations face a repetitive, error-prone workflow. Every new bench requires the same sequence of CLI commands: `bench init`, `bench get-app`, `bench new-site`, app installation, and environment configuration. There is no unified view of what benches exist, what state they are in, which sites they contain, or which apps are installed. Managing multiple benches — across development, staging, and client projects — is done entirely through terminal muscle memory.

### 1.2 Solution

**Bench Manager** is a local-first web application that provides a unified dashboard for discovering, monitoring, and controlling Frappe bench installations on a developer's machine. It runs as a local service on WSL2 (or any Linux environment) and is accessed through a browser. In V1, all functionality is scoped to the local machine. Remote server management is planned for V2.

### 1.3 Goals

- Eliminate repetitive CLI sequences for creating new benches
- Provide instant visibility into all local benches, their sites, and installed apps
- Enable start/stop control of benches without opening a terminal
- Introduce bench templates to standardize and accelerate common setups
- Stream live output from long-running bench operations (init, get-app, migrate)

### 1.4 Non-Goals (V1)

- Remote server management (planned V2)
- Multi-user access or authentication
- Production deployment management (supervisor, nginx config)
- ERPNext data management (doctypes, reports, etc.)
- Bench backup or restore operations

---

## 2. Users

**Primary user:** A solo Frappe/ERPNext developer or implementer working on WSL2 or a Linux machine, managing 3–10+ bench directories for different clients or purposes. They are comfortable with the terminal but want to reduce context-switching and eliminate repetitive command sequences.

---

## 3. Design System

### 3.1 Setup Command

The frontend was bootstrapped with the following command and **must not be re-initialized or overridden**:

```bash
pnpm dlx shadcn@latest init --preset b3JRH7a5X1 --template vite
```

### 3.2 Component Availability

shadcn/ui components have already been installed into `frontend/src/components/ui/`. Before reaching for a component, check if it already exists in that folder. If the required component is not present, create it using the shadcn CLI:

```bash
pnpm dlx shadcn@latest add <component-name>
```

Do not manually write shadcn component primitives from scratch — always use the CLI to add missing ones so they stay consistent with the preset configuration.

### 3.2 shadcn Configuration (locked)

These settings are fixed and must be respected by all contributors and AI tools. Do not change them.


| Setting       | Value                  |
| ------------- | ---------------------- |
| Style         | Nova                   |
| Base Color    | Mist                   |
| Theme         | Cyan                   |
| Chart Color   | Teal                   |
| Heading Font  | JetBrains Mono         |
| Body Font     | DM Sans                |
| Icon Library  | HugeIcons              |
| Border Radius | Small                  |
| Menu Style    | Inverted / Translucent |
| Menu Accent   | Subtle                 |


### 3.3 Theme

The app supports **light and dark mode** via a toggle in the sidebar or topbar. Theme preference is persisted in `localStorage`. The default theme is dark.

Implementation uses the standard shadcn/ui dark mode pattern with a `ThemeProvider` wrapping the app root and a `useTheme` hook powering the toggle control.

### 3.4 Icon Library

All icons must use **HugeIcons** (`@hugeicons/react`). Do not use `lucide-react` anywhere in the codebase, even though shadcn/ui ships with lucide as a default. Replace any lucide icons introduced by shadcn components with their HugeIcons equivalents.

### 3.5 Package Manager

The project uses **pnpm** exclusively. Do not use `npm` or `yarn` for installing dependencies or running scripts.

---

## 4. Architecture

### 4.1 High-Level

```
Browser (localhost:5173)
        │
        ▼
React Frontend (Vite dev server)
        │  HTTP + WebSocket
        ▼
FastAPI Backend (localhost:8000)
        │
        ├── Bench Discovery (filesystem scan)
        ├── Process Control (subprocess / psutil)
        ├── Bench Operations (bench CLI via asyncio subprocess)
        └── WebSocket Log Streaming
```

### 4.2 Backend — FastAPI (Python)

The backend is a lightweight FastAPI application that runs as a local daemon. It is responsible for:

- **Discovery:** Scanning a configurable root directory for valid bench installations
- **Inspection:** Reading bench metadata from the filesystem (`apps.txt`, `sites/`, `Procfile`, `env/`)
- **Process control:** Starting and stopping bench processes
- **Operations:** Executing `bench` CLI commands and streaming their stdout/stderr output over WebSocket
- **State persistence:** Storing templates and app config in a local SQLite database via SQLModel

**Key libraries:**


| Library    | Purpose                                         |
| ---------- | ----------------------------------------------- |
| `fastapi`  | API framework                                   |
| `uvicorn`  | ASGI server                                     |
| `sqlmodel` | ORM + schema (SQLite)                           |
| `psutil`   | Process detection and management                |
| `watchdog` | Filesystem watching for live bench discovery    |
| `asyncio`  | Async subprocess for non-blocking CLI execution |
| `pydantic` | Request/response validation (native to FastAPI) |


### 4.3 Frontend — React + Vite

A single-page application consuming the FastAPI backend over REST and WebSocket.

**Core stack:**


| Library                 | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `react` + `vite`        | UI framework and build tool                                          |
| `tailwindcss`           | Utility-first styling                                                |
| `shadcn/ui`             | Component library                                                    |
| `zod`                   | Schema validation for all forms                                      |
| `react-hook-form`       | Form state management, integrated with zod via `@hookform/resolvers` |
| `@tanstack/react-query` | Server state, caching, background refetching                         |
| `react-router-dom`      | Client-side routing                                                  |
| `zustand`               | Lightweight client-side state (UI state, active bench selection)     |
| `xterm.js`              | Terminal emulator component for log streaming                        |
| `@hugeicons/react`      | Icon library (replaces lucide-react — see §3.4)                      |
| `axios`                 | HTTP client                                                          |


---

## 5. Features — V1

### 5.1 Bench Discovery

The backend scans a configurable root directory (default: `~`) for folders that match the structure of a valid Frappe bench:

- Contains `apps/` directory
- Contains `sites/` directory
- Contains `env/` directory (Python virtualenv)
- Contains `Procfile`

Discovery runs on startup and re-runs on a configurable interval (default: 60s). A `watchdog` filesystem watcher also triggers re-discovery when directories are created or deleted under the root.

**No manual registration required.** If it looks like a bench, it appears in the UI.

---

### 5.2 Dashboard

The main view. Displays all discovered benches as cards in a grid or list layout (user toggle).

**Each bench card shows:**

- Bench name (directory name)
- Absolute path
- Frappe version (read from `apps/frappe/frappe/__version__.py`)
- Number of sites
- Number of installed apps
- Running status (green / stopped / unknown)
- Quick actions: Start, Stop, Open in terminal (launches `wt` or `gnome-terminal` to the bench path)

**Dashboard header:**

- Total bench count
- Running bench count
- Global search (filter benches by name, path, app, or site name)
- "New Bench" button

---

### 5.3 Bench Detail View

Clicking a bench card opens its detail page. Tabbed layout with three tabs:

**Tab 1 — Overview**

- Full path, Python version, Frappe version
- Process status with PID if running
- Port assignments (read from `Procfile`)
- Start / Stop / Restart controls
- "Open Terminal Here" action

**Tab 2 — Sites**

- List of all sites under `sites/` (excluding `assets/` and `apps.txt`)
- For each site: site name, installed apps (read from `site_config.json` and `installed_apps` table via `bench --site execute`)
- Actions per site: Open in browser, drop site (with confirmation dialog)
- "New Site" button → opens New Site form

**Tab 3 — Apps**

- List of apps in `apps/` with their version (read from each app's `__version__.py` or `setup.py`)
- "Get App" button → opens Get App form with repo URL input

---

### 5.4 New Bench Wizard

Triggered from the "New Bench" button on the dashboard. A multi-step form:

**Step 1 — Basic Config**

- Bench name (directory name) — validated: no spaces, no special characters
- Parent directory (default: `~`, configurable)
- Frappe version (dropdown: `version-15`, `version-14`, `develop`)

**Step 2 — Apps**

- Optionally select apps to install after init
- Choose from: saved templates (see 5.6), manually entered repo URLs, or a curated list of common apps (ERPNext, HRMS, Payments, etc.)

**Step 3 — Site (Optional)**

- Toggle: "Also create a site after init"
- Site name input
- Admin password input
- DB root password input
- Select apps to install on the site

**Step 4 — Review & Run**

- Summary of all selected options
- "Start" button triggers execution

Execution streams live output via WebSocket into an embedded `xterm.js` terminal panel. The wizard remains open while running. On success, the new bench appears in the dashboard automatically.

---

### 5.5 New Site Form

Available from the Bench Detail → Sites tab. A focused form (not a wizard):

- Site name — validated
- Admin password
- DB root password
- Apps to install (multi-select from apps available in the bench)

Execution streams output in a log panel. On success, the site appears in the Sites tab.

---

### 5.6 Bench Templates

A template captures a reusable bench configuration: Frappe version + list of apps to get after init.

**Template list view:**

- Name, Frappe version, app count, last used date
- "Use Template" button → pre-fills the New Bench Wizard
- Edit, Delete actions

**Create template:**

- From scratch via a form
- Or "Save as Template" from the New Bench Wizard review step

**Template storage:** SQLite via SQLModel. Templates are local to the machine.

---

### 5.7 Live Log Streaming

Any long-running operation (bench init, get-app, migrate, new-site) streams stdout and stderr to the frontend over WebSocket. Output is rendered in an `xterm.js` panel embedded in the relevant modal or wizard step.

- Color-coded output (green for success lines, red for errors)
- Auto-scroll with a "Pause scroll" toggle
- Copy output to clipboard button
- Download log as `.txt` button

---

### 5.8 Settings

A settings page (accessible from the sidebar) for:

- **Root scan directory** — the path Bench Manager scans for benches (default: `~`)
- **Excluded paths** — glob patterns to ignore during scan (e.g. `~/.cache`, `~/node_modules`)
- **Scan interval** — how often to re-scan (default: 60s)
- **Common apps registry** — a user-editable list of app name → GitHub URL mappings shown as suggestions in the New Bench Wizard

---

## 6. Data Model

### 6.1 Filesystem (Read-only, source of truth)

```
~/my-bench/
├── apps/
│   ├── frappe/
│   │   └── frappe/__version__.py
│   └── erpnext/
│       └── erpnext/__version__.py
├── sites/
│   ├── mysite.localhost/
│   │   └── site_config.json
│   └── assets/
├── env/
├── Procfile
└── apps.txt
```

### 6.2 SQLite (Persisted, managed by Bench Manager)

```sql
-- Bench templates
CREATE TABLE template (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    frappe_version TEXT NOT NULL,
    apps        TEXT NOT NULL,  -- JSON array of {name, repo_url}
    created_at  DATETIME,
    last_used_at DATETIME
);

-- App registry (user-curated shortcuts)
CREATE TABLE app_registry (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_url    TEXT NOT NULL,
    description TEXT
);
```

---

## 7. API Design

### REST Endpoints


| Method   | Path                                     | Description                               |
| -------- | ---------------------------------------- | ----------------------------------------- |
| `GET`    | `/api/benches`                           | List all discovered benches               |
| `GET`    | `/api/benches/{bench_name}`              | Bench detail (sites, apps, status)        |
| `POST`   | `/api/benches/{bench_name}/start`        | Start bench                               |
| `POST`   | `/api/benches/{bench_name}/stop`         | Stop bench                                |
| `POST`   | `/api/benches/{bench_name}/restart`      | Restart bench (stop → start)              |
| `GET`    | `/api/benches/{bench_name}/sites`        | List sites                                |
| `POST`   | `/api/benches/{bench_name}/sites`        | Create new site                           |
| `DELETE` | `/api/benches/{bench_name}/sites/{site}` | Drop a site                               |
| `GET`    | `/api/templates`                         | List templates                            |
| `POST`   | `/api/templates`                         | Create template                           |
| `PUT`    | `/api/templates/{id}`                    | Update template                           |
| `DELETE` | `/api/templates/{id}`                    | Delete template                           |
| `GET`    | `/api/settings`                          | Get settings                              |
| `PUT`    | `/api/settings`                          | Update settings                           |
| `POST`   | `/api/operations/init`                   | Start bench init (returns operation_id)   |
| `POST`   | `/api/operations/get-app`                | Get app into bench (returns operation_id) |


### WebSocket


| Path                                               | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- |
| `ws://localhost:8000/ws/operations/{operation_id}` | Stream stdout/stderr for a running operation       |
| `ws://localhost:8000/ws/benches`                   | Real-time bench status updates (start/stop events) |


---

## 8. UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Bench Manager          [Search...]    [New Bench +] │
├──────────┬──────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Main Content Area                        │
│          │                                           │
│ Dashboard│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│          │  │ bench-1  │ │ bench-2  │ │ bench-3  │  │
│ Templates│  │ 🟢 Running│ │ ⚫ Stopped│ │ 🟢 Running│  │
│          │  │ 3 sites  │ │ 1 site   │ │ 2 sites  │  │
│ Settings │  │ 5 apps   │ │ 3 apps   │ │ 4 apps   │  │
│          │  └──────────┘ └──────────┘ └──────────┘  │
│          │                                           │
└──────────┴──────────────────────────────────────────┘
```

---

## 9. Project Structure

```
bench-manager/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Settings management
│   ├── database.py              # SQLite + SQLModel setup
│   ├── models/
│   │   ├── bench.py             # Pydantic models for bench/site/app
│   │   └── template.py          # Template ORM model
│   ├── routes/
│   │   ├── benches.py           # Bench discovery + control routes
│   │   ├── sites.py             # Site management routes
│   │   ├── templates.py         # Template CRUD routes
│   │   ├── operations.py        # Long-running operation routes
│   │   └── settings.py          # Settings routes
│   ├── services/
│   │   ├── discovery.py         # Filesystem scanning logic
│   │   ├── process.py           # psutil process management
│   │   └── executor.py          # asyncio subprocess + WebSocket streaming
│   └── ws/
│       └── manager.py           # WebSocket connection manager
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── lib/
        │   ├── api.ts           # Axios instance + typed API calls
        │   ├── ws.ts            # WebSocket client helpers
        │   └── utils.ts
        ├── stores/
        │   └── ui.store.ts      # Zustand: sidebar state, active bench, etc.
        ├── hooks/
        │   ├── useBenches.ts    # React Query hooks
        │   ├── useBench.ts
        │   └── useOperation.ts  # WebSocket-backed operation state
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── BenchDetail.tsx
        │   ├── Templates.tsx
        │   └── Settings.tsx
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx
        │   │   └── Topbar.tsx
        │   ├── bench/
        │   │   ├── BenchCard.tsx
        │   │   ├── BenchStatus.tsx
        │   │   ├── SiteList.tsx
        │   │   └── AppList.tsx
        │   ├── wizards/
        │   │   ├── NewBenchWizard.tsx
        │   │   └── NewSiteForm.tsx
        │   ├── templates/
        │   │   └── TemplateCard.tsx
        │   └── shared/
        │       ├── LogStream.tsx    # xterm.js wrapper
        │       ├── StatusBadge.tsx
        │       └── ConfirmDialog.tsx
        └── schemas/
            ├── bench.schema.ts      # Zod schemas
            ├── site.schema.ts
            └── template.schema.ts
```

---

## 10. V2 Preview — Remote Server Management

V2 will extend Bench Manager with the ability to connect to and manage benches on remote cloud servers. The core addition is a **Server Registry** and a **remote FastAPI agent** that runs on each remote server.

The same FastAPI backend codebase will be deployed as a lightweight agent on remote servers. The local backend will SSH-tunnel into the remote agent and proxy requests from the frontend. From the UI perspective, remote benches will look identical to local ones, distinguished only by a server label in the sidebar.

V2 scope includes:

- Server registry (nickname, host, SSH user, key path)
- One-click remote agent deployment
- SSH tunnel management (on-demand, with keepalive)
- Read-only mode for production servers
- Unified sidebar: local + remote benches in one tree

---

## 11. V1 Milestones


| Milestone                       | Scope                                                                                       | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| **M1 — Backend foundation**     | FastAPI setup, bench discovery, REST API for benches/sites/apps, SQLite init                | Done   |
| **M2 — Frontend scaffold**      | Vite + React + Tailwind + shadcn setup, routing, sidebar layout, dashboard with static data | Done   |
| **M3 — Live dashboard**         | React Query integration, real bench data on dashboard, bench detail view                    | Done   |
| **M4 — Process control**        | Start/stop benches, status polling, WebSocket bench status updates                          | Done   |
| **M5 — Operations + streaming** | New Bench Wizard, New Site form, WebSocket log streaming via xterm.js                       | Done   |
| **M6 — Templates**              | Template CRUD, "Use Template" in wizard, "Save as Template" shortcut                        | Done   |
| **M7 — Settings + polish**      | Settings page, scan config, common apps registry, UI polish pass                            | Done   |


---

## 12. Decisions

1. **Process management:** Bench Manager will detect and attach to already-running bench processes (started externally via terminal). It will not exclusively own the process lifecycle. `psutil` will scan for matching processes by working directory and command signature on each status poll. Start/Stop/Restart controls will work whether or not Bench Manager originally started the process.
2. **Restart operation:** A dedicated `bench restart` control is included on the Bench Detail view. Implemented as a stop → short delay → start sequence, exposed as a single atomic action in both the UI and the API (`POST /api/benches/{bench_name}/restart`).
3. **Site drop confirmation:** Dropping a site requires the user to type the exact site name into a confirmation input before the destroy button becomes active. This matches the UX pattern used by platforms like GitHub for destructive actions and prevents accidental data loss.
4. **Default app registry:** The app registry ships with a curated default list of well-known Frappe/ERPNext apps. Users can add, edit, or remove entries. The default list includes:


| App            | Repo                                        |
| -------------- | ------------------------------------------- |
| ERPNext        | `https://github.com/frappe/erpnext`         |
| HRMS           | `https://github.com/frappe/hrms`            |
| Payments       | `https://github.com/frappe/payments`        |
| LMS            | `https://github.com/frappe/lms`             |
| Helpdesk       | `https://github.com/frappe/helpdesk`        |
| CRM            | `https://github.com/frappe/crm`             |
| Insights       | `https://github.com/frappe/insights`        |
| Print Designer | `https://github.com/frappe/print_designer`  |
| Builder        | `https://github.com/frappe/builder`         |
| WhatsApp       | `https://github.com/frappe/frappe_whatsapp` |


