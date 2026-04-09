# FashionVision

AI-powered fashion analysis and wardrobe intelligence platform built with Flask, Supabase, and modern computer vision/NLP models.

FashionVision lets users upload outfit images, validate fashion relevance, extract attributes (type/color/style/pattern/season), generate content, track history, schedule posts, view analytics, and export a PDF lookbook.

## Features

- Secure auth and session handling with Supabase Auth
- Image upload + fashion-only validation gate
- AI analysis pipeline for outfit attributes and content generation
- User history and delete support
- Scheduling workflow for planned posts
- Palette extraction from uploaded images
- Analytics summary and timeline endpoints
- AI chat stylist endpoint (Gemini)
- PDF lookbook export
- Cinematic frontend (home, dashboard, history, analytics)

## Tech Stack

- Backend: Flask, Flask-CORS, Flask-Limiter
- AI/ML: PyTorch, Transformers (CLIP/BLIP stack), Ultralytics, Pillow, OpenCV
- Data/Auth/Storage: Supabase
- Generative AI: Google Generative AI (Gemini)
- Export: ReportLab
- Deployment: Vercel (Python runtime) or Gunicorn

## Project Structure

```text
FashionVision-/
├── api/
│   ├── index.py                # Flask app entry point + route registration
│   ├── config.py               # environment config + validation
│   ├── auth_routes.py          # /api/auth/*
│   ├── upload_routes.py        # /api/upload/*
│   ├── schedule_routes.py      # /api/schedule/*
│   ├── history_routes.py       # /api/history/*
│   ├── palette_routes.py       # /api/palette/*
│   ├── stats_routes.py         # /api/stats/*
│   ├── chat_routes.py          # /api/chat/*
│   ├── export_routes.py        # /api/export/*
│   ├── supabase_client.py      # Supabase client handling
│   ├── requirements.txt        # mirrors root requirements for api runtime
│   └── ai/
│       ├── analyzer.py
│       ├── fashion_validator.py
│       ├── fashion_detector.py
│       ├── content_generator.py
│       ├── correction_engine.py
│       ├── cache.py
│       ├── metrics.py
│       ├── batch.py
│       ├── fashion_vision_config.py
│       ├── fashion_vision_config.yaml
│       └── README.md
├── templates/                  # Flask HTML templates
├── static/                     # CSS/JS/assets
├── schema.sql                  # Supabase schema + RLS policies
├── requirements.txt
├── .env.example
└── vercel.json
```

## Environment Variables

Copy `.env.example` to `.env` and fill values.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SECRET_KEY`
- `JWT_SECRET`
- `CLIENT_URL`

Optional/common:

- `SUPABASE_UPLOADS_TABLE` (default: `uploads`)
- `SUPABASE_SCHEDULED_PINS_TABLE` (default: `scheduled_pins`)
- `SUPABASE_FASHION_HISTORY_TABLE` (default: `fashion_history`)
- `SUPABASE_STORAGE_BUCKET` (default: `fashion-images`)
- `MAX_CONTENT_LENGTH` (default: 16777216)
- `OPENWEATHER_API_KEY` (optional)
- `GEMINI_API_KEY` (required for `/api/chat/consult`)
- `FLASK_ENV`, `FLASK_DEBUG`

## Setup

### 1) Create and activate virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2) Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3) Initialize database (Supabase)

Run `schema.sql` in Supabase SQL editor.

### 4) Run locally

```bash
python -m api.index
```

App runs on: `http://127.0.0.1:5000` (or `0.0.0.0:5000` inside container)

## API Route Overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Upload

- `POST /api/upload` or `POST /api/upload/analyze`
- `GET /api/upload/usage`
- `POST /api/upload/validate-image`

### History

- `GET /api/history`
- `DELETE /api/history/<item_id>`

### Schedule

- `POST /api/schedule`
- `GET /api/schedule`

### Palette / Stats / Chat / Export

- `POST /api/palette/extract`
- `GET /api/stats/summary`
- `GET /api/stats/timeline`
- `POST /api/chat/consult`
- `GET /api/export/lookbook`

### Utility

- `GET /api/health`
- `GET /api/weather`

## Frontend Pages

- `/` -> cinematic landing
- `/login` -> auth login
- `/signup` -> registration
- `/dashboard` -> upload/analyze workspace
- `/history` -> archive interactions
- `/analytics` -> trend and timeline visualizations

## Deployment

### Vercel

`vercel.json` routes all requests to `api/index.py` via `@vercel/python`.

### Gunicorn

```bash
gunicorn -w 2 -b 0.0.0.0:5000 api.index:app
```

## Notes on AI Validation

The fashion validator uses CLIP-based zero-shot classification with additional heuristics and caching.

Recent hardening includes:

- configurable inference timeout from `api/ai/fashion_vision_config.yaml`
- fallback heuristic path when CLIP timeout occurs
- fail-closed behavior for uncertain cases

## Useful Dev Commands

```bash
# Show registered routes
python print_routes.py

# Run helper scripts
python test_mock.py
python test_supabase.py
python test_blocking.py
```

## Troubleshooting

### Module import errors

If you see missing modules (for example `flask`, `flask_limiter`):

```bash
python -m pip install -r requirements.txt
```

### Config validation failure on startup

`api/config.py` fails fast when required env vars are missing. Fill `.env` first.

### Slow first run

Model initialization and HuggingFace downloads can take time on first startup.

---

If you want, I can also generate:

- a separate `docs/API.md` with request/response examples
- a deployment checklist for Railway/Fly.io
- a short contributor guide (`CONTRIBUTING.md`)
