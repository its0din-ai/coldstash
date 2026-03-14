# ColdStash v0.7 — Next.js + TypeScript

A Cold Storage Multi-Disk File Indexer designed for environments where data is distributed across many removable or offline disks. The software catalogs file metadata from each disk and stores it in a central index, enabling fast search and identification of files across an entire archive without needing to mount or spin up every storage device.

Built with Next.js · TypeScript · Tailwind · SQLite

⚠️ This project was fully Vibe Coded by AI and reviewed by a human. Bugs, security issues, or unexpected behavior may still exist. Use at your own risk and validate it before relying on it.

## Docker

### Development
```bash
# Start the dev container (hot reload enabled)
docker compose -f docker-compose.dev.yml up --build

# The DB seeds automatically on first start.
# If ADMIN_PASSWORD is not set, a random password is generated.
# Read it from the running container:
docker compose -f docker-compose.dev.yml cp coldstash:/app/data/.admin_password ./
cat .admin_password
```

### Production
```bash
# 1. Generate a JWT secret and set it in .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Optionally set a known admin password (skip for random)
# echo "ADMIN_PASSWORD=your-chosen-password" >> .env

# 3. Build and start
docker compose -f docker-compose.yml up -d --build

# 4. On first boot, if ADMIN_PASSWORD is not set, read the generated password
docker compose cp coldstash:/app/data/.admin_password ./
cat .admin_password

# 5. Delete the password file after noting it
rm .admin_password
docker compose exec coldstash rm /app/data/.admin_password
```

## Local (without Docker)

### Development
```bash
# 1. Install dependencies
npm install

# 2. Copy env and set your JWT secret (min 32 chars)
cp .env.example .env.local

# 3. Run dev server — DB seeds automatically on first start
npm run dev
# → http://localhost:3000

# 4. If ADMIN_PASSWORD is not set, read the generated password
cat data/.admin_password
```

### Production
```bash
# 1. Generate a JWT secret
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env.local

# 2. Build and start
npm run build
npm start

# 3. If ADMIN_PASSWORD is not set, read the generated password
cat data/.admin_password
```

## Security (OWASP Top 10)

| OWASP | Control |
|-------|---------|
| A01 Broken Access Control     | NextJS Proxy enforces auth on all routes; admin routes additionally check role |
| A02 Cryptographic Failures    | JWT via `jose` (HS256); bcrypt cost=12 for passwords; httpOnly+SameSite cookie |
| A03 Injection                 | Zod validates all API inputs; better-sqlite3 uses parameterised queries only |
| A04 Insecure Design           | Least-privilege RBAC: viewers can only search; token in httpOnly cookie |
| A05 Security Misconfiguration | CSP, X-Frame-Options, Referrer-Policy in next.config.js |
| A07 Auth Failures             | Constant-time bcrypt (dummy hash for missing users); rate limit 10/60s per IP |
| A09 Logging & Monitoring      | Append-only JSON audit log for every auth + admin action |

## Disk Indexing (Windows)

```bash
# Install Python deps (one-time)
pip install py7zr rarfile

# Index each disk
python scripts/disk-indexer.py Disk00 E:\
python scripts/disk-indexer.py Disk01 F:\ --no-archives

# Then import the generated ~/ColdStash/Disk00.json via the web UI
```

## Roles

| Role    | Privilege |
|---------|--------|
| viewer  | Search files, view disk list, read guide |
| admin   | All viewer actions + import/delete disks, manage users, read audit log |
