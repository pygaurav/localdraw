# LocalDraw

LocalDraw is a self-hosted whiteboard fork based on Excalidraw, customized for local-first workflows.

## Quick Start (3 commands)

```bash
cd /Users/{user}/Documents/Code_Verse/localdraw
docker compose up --build -d
open http://localhost:6001
```

Optional local domain:

1. Add `127.0.0.1 example.com` to `/etc/hosts`
2. Open `http://example.com`

## What is different in this fork

- Rebranded UI and assets as **LocalDraw**.
- Persistent storage via backend files instead of browser `localStorage`.
- Multi-tab scene management (tab list, active tab, tab rename/delete).
- Ollama integration support through saved app preferences.
- Docker-first deployment with Nginx reverse proxy + Express API.

## Architecture

```
Browser -> Nginx (port 80 in container)
        -> static LocalDraw frontend
        -> /api/* -> localdraw-server (Express, port 6002)

Data path inside backend container:
/app/data
  - scenes/*.localdraw
  - tabs.json
  - prefs.json
  - chats/*.json
```

## Storage behavior (important)

This fork does **not** rely on browser `localStorage` for your primary drawings.

- Scene and app state are persisted on the backend as files.
- In Docker, files are stored in the `scenes_data` Docker volume by default.
- Data survives container rebuild/restart as long as the volume is kept.

## Run with Docker Compose (recommended)

Prerequisites:

- Docker 24+
- Docker Compose v2

From repo root:

```bash
docker compose up --build -d
```

Stop services:

```bash
docker compose down
```

Current service ports (`docker-compose.yml`):

- `80 -> localdraw:80`
- `6001 -> localdraw:80`
- `6002 -> localdraw-server:6002`

Open:

- `http://localhost:6001`
- `http://localhost`

If you want domain-style local access:

1. Add to `/etc/hosts`:

```txt
127.0.0.1 example.com
```

2. Open `http://example.com`

(`nginx.conf` already includes `server_name example.com localhost _;`)

## Where Docker data is stored

By default (`docker-compose.yml`):

```yaml
volumes:
  - scenes_data:/app/data
```

This means files are saved in the named Docker volume `scenes_data`, not in browser storage.

### Inspect the volume mount path

```bash
docker volume inspect localdraw_scenes_data
```

(`excalidraw` is the compose project name from this folder.)

## Optional: save data to a host directory instead of named volume

Edit `docker-compose.yml` backend service:

```yaml
services:
  localdraw-server:
    volumes:
      - /absolute/host/path/localdraw-data:/app/data
```

Then your files appear directly under that host path.

## Ollama integration

The app includes Ollama-related settings and request flow.

- Ollama preferences are persisted in backend prefs (`/app/data/prefs.json`).
- If your Ollama server is local to your host machine, make sure the URL is reachable from where LocalDraw runs.

Typical host Ollama URL for local non-container usage:

- `http://localhost:11434`

If needed in Docker networking contexts, use an address resolvable from the frontend/backend environment.

## Run without Docker

Prerequisites:

- Node.js 20+
- Yarn

Install dependencies:

```bash
yarn install
cd server && yarn install
cd ../localdraw-app && yarn install
```

Start the backend:

```bash
cd server
yarn start
```

Start the frontend in a separate terminal:

```bash
cd localdraw-app
yarn start
```

Backend defaults:

- `PORT=6002`
- `DATA_DIR=server/data`

Override example:

```bash
DATA_DIR=/Users/you/localdraw-data PORT=6002 node server/server.js
```

## Environment reference

- `PORT`: backend listen port.
- `DATA_DIR`: backend root folder for persisted files.
- `VITE_SERVER_URL`: optional frontend override for API base URL.

## Troubleshooting

### UI still shows old branding/text

Because the app is PWA-enabled, clear cached assets:

1. DevTools -> Application -> Service Workers -> Unregister
2. Clear site data
3. Hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`)

### Data missing after restart

- Confirm you did not remove the Docker volume.
- Check backend logs:

```bash
docker compose logs -f localdraw-server
```

## License

This repository remains under the upstream MIT license terms.
