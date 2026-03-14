#!/bin/sh
# docker/entrypoint.sh
#
# Runs as root. Detects the right UID:GID, fixes ownership of writable
# paths, then drops privileges via `gosu UID:GID` before exec-ing the app.
#
# UID detection priority:
#   1. PUID / PGID environment variables (explicit)
#   2. Owner of the bind-mounted /app directory  (auto-detect)
#   3. Fallback: 1001
#
# NOTE: we always pass numeric UID:GID to gosu — never a username — because
# the base image's built-in users (e.g. "node" at uid 1000) can cause gosu
# to fail if their shell or passwd entry is unusual.

set -e

# ── 1. Resolve UID / GID ─────────────────────────────────────────────────────

if [ -n "$PUID" ] && [ -n "$PGID" ]; then
  TARGET_UID="$PUID"
  TARGET_GID="$PGID"
else
  TARGET_UID="$(stat -c '%u' /app 2>/dev/null || echo 1001)"
  TARGET_GID="$(stat -c '%g' /app 2>/dev/null || echo 1001)"
fi

# Never run as root inside the container
[ "$TARGET_UID" = "0" ] && TARGET_UID=1001
[ "$TARGET_GID" = "0" ] && TARGET_GID=1001

echo "[entrypoint] UID=${TARGET_UID} GID=${TARGET_GID}"

# ── 2. Ensure a real user entry exists for this UID ──────────────────────────
# gosu needs the UID to resolve in /etc/passwd. If the base image already has
# a user at this UID (e.g. "node" at 1000), reuse it. Otherwise create one.
if ! getent passwd "$TARGET_UID" > /dev/null 2>&1; then
  if ! getent group "$TARGET_GID" > /dev/null 2>&1; then
    addgroup -g "$TARGET_GID" appgroup
  fi
  GNAME="$(getent group "$TARGET_GID" | cut -d: -f1)"
  adduser -D -H -u "$TARGET_UID" -G "$GNAME" appuser
fi

# ── 3. Fix ownership on writable paths ───────────────────────────────────────
for dir in /app/.next /app/data /app/logs /app/node_modules; do
  [ -d "$dir" ] && chown -R "${TARGET_UID}:${TARGET_GID}" "$dir" 2>/dev/null || true
done
chown "${TARGET_UID}:${TARGET_GID}" /app 2>/dev/null || true

# ── 4. Drop to UID:GID and exec ──────────────────────────────────────────────
# Pass numeric IDs — avoids any username-resolution issues entirely.
exec gosu "${TARGET_UID}:${TARGET_GID}" "$@"