# Inferno Scraper

This repository contains various scraping scripts. Proxy servers are no longer hardcoded in the scripts.

## Local development

Set the environment variable `LOCAL_MODE=1` to make the application read and
write data files locally instead of using the GitHub API. When running the
frontend from your machine, it will automatically talk to `http://localhost:5000`
if available.

## Proxy configuration

Proxies can be provided in two ways:

1. **Environment variable** `PROXIES`
   - Set `PROXIES` to a comma separated list of `ip:port:user:password` entries.
2. **Configuration file**
   - Create a file named `proxies.txt` in the repository root (or specify a different path with the `PROXY_FILE` environment variable).
   - Each line should contain one proxy in the same `ip:port:user:password` format.

Both `1- Sitemap links.py` and `3 - Ad HTML scraper.py` automatically load proxies using this logic.

## Authentication

The backend can be protected with a lightweight password gate.

- Set environment variables `AUTH_PASSWORD` and `AUTH_COOKIE_SECRET` on the server.
- Clients authenticate by POSTing `{ "password": "..." }` to `/auth/login`.
- A signed session cookie is returned on success and required for `/scrape`, `/cancel`, `/restart`, `/progress_update` and `/progress`.
- `/auth/logout` clears the cookie. `/auth/status` reports the current state.

Cookies are HttpOnly and last for 24 hours. Failed login attempts are limited to 5 per minute per IP.

## Deployment

The app can be deployed on platforms that respect a Procfile. Two common options are outlined below.

### Railway

Railway picks up the included `railway.json` and uses [Nixpacks](https://docs.railway.com/deploy/nixpacks) by default.

1. Push the repository to GitHub.
2. Create a new service from the repository in the Railway dashboard.
3. Railway will install dependencies with `pip install -r requirements.txt` and start the server with the Gunicorn command from the Procfile (`gunicorn main:app --bind 0.0.0.0:$PORT --timeout 600 --workers 1 --threads 4`).

### Other platforms

Any host that understands a Procfile can run the project as well. Point it at this repo and ensure the start command is the same as above so long-running scrapes do not trigger worker restarts.

### Remote storage on GitHub

When `LOCAL_MODE` is not set, the scraper reads and writes its data files using the GitHub API.
Set the following environment variables on your deployment platform:

- `GH_TOKEN` – personal access token with repo scope.
- `GITHUB_REPO` – repository in `owner/name` form.
- `GITHUB_BRANCH` – branch for storing data files (defaults to `data`).


## Frontend

Inline CSS and JS were split into `static/css/styles.css` and `static/js/app.js`.
