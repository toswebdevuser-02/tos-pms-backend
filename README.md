# Project Tracker — Server

Central LAN backend for the Project Tracker desktop app: **Node + Express +
PostgreSQL + WebSocket**. One office machine runs this; every workstation's
Electron client talks to it over the local network.

## Prerequisites

- **Node 18+** (Node 26 verified).
- **PostgreSQL 14+** installed on this machine. Not yet installed here — see below.

### Installing PostgreSQL on Windows

Option A — winget (recommended):
```powershell
winget install -e --id PostgreSQL.PostgreSQL.16
```
Option B — download the installer from https://www.postgresql.org/download/windows/

During setup, set a password for the `postgres` superuser and keep the default
port `5432`. Then create the app database and a login role:

```powershell
# from a "SQL Shell (psql)" window, logged in as postgres:
CREATE ROLE tracker WITH LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE project_tracker OWNER tracker;
```

## Setup

```powershell
cd server
npm install
copy .env.example .env        # then edit .env (DATABASE_URL, JWT_SECRET, ...)
npm run prisma:generate
npm run prisma:migrate        # creates all tables (first run names it e.g. "init")
```

## Importing existing data

Point `LEGACY_DATA_JSON` in `.env` at the current desktop app's data file
(usually `%APPDATA%/project-tracker/data.json`) then:

```powershell
npm run migrate:json
```

This preserves all ids, reseeds sequences, imports attachments' records, and
creates a login for every member with a **temporary password** (printed at the
end — share securely; users reset on first login).

If no members have emails yet, bootstrap the first admin instead:

```powershell
npm run seed:admin -- admin@firm.com "Admin Name"
```

## Running

```powershell
npm run dev      # development, auto-reload
npm run build && npm start   # production
```

Server listens on `http://0.0.0.0:<PORT>` (default 4000). Clients connect to
`http://<this-machine-LAN-IP>:4000`.

## Deployment (Phase 6)

- Run as a Windows service with NSSM or pm2-windows-service so it starts on boot.
- Allow the port through Windows Firewall for the office subnet only.
- Schedule a nightly `pg_dump` backup.
