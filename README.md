# LinkDrop — Universal Link → Video/Audio Downloader

A fast, self-hostable Next.js web app powered by `yt-dlp` and `ffmpeg`. Paste any supported public link (YouTube, Instagram, X/Twitter, Facebook, Reddit, SoundCloud, and 1000+ other sites) to inspect available resolutions and download as **Video (MP4)** or **Audio (MP3)** with live progress updates.

---

## Features

- **Inspect & Choose Quality**: Displays thumbnail, title, uploader, duration, site badge, and detected resolutions (360p → 4K) with **Best quality** selected by default.
- **MP4 & MP3 Output**: Merges best video + audio into a playable `.mp4`, or extracts highest-quality `.mp3` audio via `ffmpeg`.
- **Live SSE Progress**: Streams download percentage, speed, ETA, and processing stages (`fetching` → `downloading` → `merging` / `converting` → `ready`) over Server-Sent Events.
- **Safe Cross-Platform Filenames**: Sanitizes video titles for Windows, macOS, and Linux, with RFC 5987 UTF-8 `Content-Disposition` headers.
- **Security Built-In**:
  - Strict `http`/`https` validation and flag-injection protection (`--` separator + argument arrays, never shell strings).
  - SSRF protection blocking private/local IPv4 & IPv6 ranges both statically and after DNS resolution.
  - Per-IP rate limiting (`/api/info`) and per-IP + global download concurrency limits.
  - Automatic temp file cleanup after every download (success or failure) plus a background sweep every 5 minutes for files older than 30 minutes.
- **Dark Theme & Mobile-First UI**: Responsive down to 375px screens, dark theme by default with light/dark toggle, clipboard paste button, and local download history (`localStorage`).

---

## Prerequisites (Local Setup)

You need **Node.js 20+**, **yt-dlp**, and **ffmpeg** installed on your machine.

### macOS (Homebrew)
```bash
brew install node yt-dlp ffmpeg
```

### Windows (winget)
```powershell
winget install OpenJS.NodeJS.LTS
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```
*(Restart your terminal after installing so `yt-dlp` and `ffmpeg` are on your `PATH`.)*

### Linux (Ubuntu / Debian)
```bash
sudo apt update && sudo apt install -y ffmpeg python3 curl
sudo curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

---

## Running Locally

Running locally on your own computer gives the **highest download success rate** because residential IPs are far less likely to be rate-limited or blocked by video platforms.

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Copy environment config
cp .env.example .env

# 3. Start development server
npm run dev
```

Or build and run in production mode:
```bash
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000).
Check server tool health at [http://localhost:3000/api/health](http://localhost:3000/api/health).

---

## Running with Docker

Docker bundles Node.js, Python 3, `ffmpeg`, and the latest `yt-dlp` release automatically.

### Two-command Docker run
```bash
docker build -t linkdrop .
docker run -p 3000:3000 --rm linkdrop
```

### Or with Docker Compose
```bash
docker compose up --build
```

---

## Environment Variables

Copy `.env.example` to `.env` to customize limits and options:

| Name | Purpose | Default |
|---|---|---|
| `MAX_FILESIZE_MB` | Maximum download file size (MB) | `500` |
| `MAX_DURATION_MIN` | Maximum media duration (minutes) | `180` |
| `RATE_LIMIT_PER_MIN` | `/api/info` requests per IP per minute | `10` |
| `MAX_CONCURRENT_PER_IP` | Simultaneous downloads per IP | `3` |
| `MAX_CONCURRENT_JOBS` | Global simultaneous downloads | `3` |
| `DOWNLOAD_TIMEOUT_SEC` | Download/conversion timeout (seconds) | `300` |
| `COOKIES_FILE` | Optional path to a Netscape-format `cookies.txt` (your own account, for age-restricted or login-required links) | *(empty)* |
| `PROXY_URL` | Optional HTTP/SOCKS proxy URL for `yt-dlp` | *(empty)* |
| `TEMP_DIR` | Directory for temporary download files | OS temp dir |
| `LOG_LEVEL` | `silent`, `error`, `info`, or `debug` | `error` |
| `YTDLP_PATH` | Custom path to `yt-dlp` binary | `yt-dlp` |
| `FFMPEG_PATH` | Custom path to `ffmpeg` binary | `ffmpeg` |

---

## Keeping `yt-dlp` Up to Date

Video platforms change frequently, so keeping `yt-dlp` updated is essential:

- **Locally**: Run `npm run update-ytdlp` (executes `yt-dlp -U || pip install -U yt-dlp`).
- **Docker**: Rebuilding the image (`docker build --no-cache -t linkdrop .`) always pulls the latest `yt-dlp` release from GitHub.
- **Automated Daily Updates (Cron / CI)**:
  - On a VPS running locally: add a daily cron job:
    ```cron
    0 4 * * * /usr/local/bin/yt-dlp -U >/dev/null 2>&1
    ```
  - On Docker/CI (e.g., GitHub Actions): schedule a daily workflow (`cron: "0 4 * * *"`) that rebuilds and redeploys the Docker image so the latest `yt-dlp` binary is always included.

---

## Hosting Recommendations

> **Note:** This app **does not** run on serverless platforms like **Vercel** or **Netlify**, because it requires long-running `yt-dlp` and `ffmpeg` child processes, local temporary disk storage, and streaming responses.

Recommended hosting options (all support Docker):
- **Local computer** (best reliability and speed)
- **VPS** (Hetzner, DigitalOcean, Linode) with Docker Compose
- **Railway**, **Render**, or **Fly.io** (deploy directly from the included `Dockerfile`)

---

## API Reference

- `GET /api/info?url=<link>` — Returns `{ title, thumbnail, duration, uploader, site, isPlaylist, heights }`.
- `GET /api/download?url=<link>&type=video|audio&height=<optional>&id=<jobId>` — Streams the finished MP4 or MP3 file as an attachment.
- `GET /api/progress?id=<jobId>` — Server-Sent Events stream emitting `{ id, stage, percent, speed, eta }`.
- `GET /api/health` — Returns `yt-dlp` version and `ffmpeg` availability.

---

## Design Decisions & Scope

- **Playlists**: When a playlist URL is checked, the UI flags it as a playlist and downloads the first item (`--no-playlist`) so server resources stay bounded.
- **Retry strategy**: On transient extraction failures, `yt-dlp` retries once with `--force-ipv4 --no-cache-dir` before returning a friendly error.
- **No DRM circumvention**: DRM-protected streams (Widevine, PlayReady, FairPlay) are explicitly rejected with a clear message.

---

## Troubleshooting

- **"Site is temporarily blocking requests from this server's IP"**: Cloud/datacenter IPs are often rate-limited by platforms like YouTube. Run the app locally on your computer, or configure `COOKIES_FILE` (exported from your own browser session) or `PROXY_URL`.
- **"yt-dlp or FFmpeg is not installed"**: Verify `yt-dlp --version` and `ffmpeg -version` work in your terminal, or set `YTDLP_PATH` / `FFMPEG_PATH` in `.env`.
- **Running tests**:
  ```bash
  npm test
  ```

---

## Legal Disclaimer

Users are solely responsible for downloading only content they own, have explicit permission to save, or are legally permitted to download for personal use. This tool does not bypass DRM, paywalls, or authentication controls.
