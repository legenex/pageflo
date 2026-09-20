#!/usr/bin/env bash
# Idempotent host-side vhosts + certificates for PageFlo control-plane hosts.
# Run as root on the Plesk box. Does not change DNS. Does not revoke certs.
# Does not touch os.legenex.com, crashclaim.co, or *.preview.legenex.com.
# Does not set PAGEFLO_LEGACY_HOST_REDIRECT.
#
# Filenames sort after crashclaim.co.conf so unmatched SNI still presents
# crashclaim.co. Never write app.pageflo.io.conf (that would steal default SNI).
#
# app.pageflo.io / pageflo.io: HTTP-01
# *.preview.pageflo.io: DNS-01 via the existing acme-dns account (same CNAME
# target as preview.legenex.com). A certificate that only lists preview.pageflo.io
# or test.preview.pageflo.io is a failure.
#
# Usage:
#   scripts/provision-pageflo-hosts.sh
#   scripts/provision-pageflo-hosts.sh --dry-run
#
# Idempotent: a second run does not replace a working TLS vhost with HTTP-only
# bootstrap, does not --force a valid certificate, and reloads nginx only after
# nginx -t passes. On nginx -t failure, previous vhost files are restored.

set -euo pipefail

NGINX_DIR=/etc/nginx/conf.d/legalos-tenants
ACME_WEBROOT=/var/www/vhosts/default/htdocs
ACME_CERT_ROOT=/etc/ssl/legalos
ACME_SH=/root/.acme.sh/acme.sh
ACME_HOME=/root/.acme.sh
RELOAD_HOOK=/root/legalos-reload-nginx-cert.sh
PROXY=http://127.0.0.1:3000
APP_ENV=/var/www/vhosts/legenex.com/os.legenex.com/.env
LE_SERVER=letsencrypt

VHOST_APEX="$NGINX_DIR/pageflo.io.conf"
VHOST_APP="$NGINX_DIR/pageflo-app.pageflo.io.conf"
VHOST_PREVIEW="$NGINX_DIR/preview.pageflo.io.conf"
# These filenames sort BEFORE crashclaim.co.conf and would steal unmatched SNI
# or outrank the PageFlo preview wildcard. Never leave them in place.
STRAY_VHOSTS=(
  "$NGINX_DIR/app.pageflo.io.conf"
  "$NGINX_DIR/test.preview.pageflo.io.conf"
  "$NGINX_DIR/www.pageflo.io.conf"
)

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

LISTEN_80="80"
LISTEN_443="443"

log() { echo "provision-pageflo-hosts: $*"; }
die() { echo "provision-pageflo-hosts: $*" >&2; exit 1; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "run as root on the production host"
  fi
}

# Join the same listen socket as crashclaim.co, the de-facto default SNI vhost.
# Mixing `listen 443` with `listen IP:443` would put these hosts on a socket
# that never receives the production traffic.
infer_listen() {
  local cfg="$NGINX_DIR/crashclaim.co.conf"
  local line80 line443
  if [ -f "$cfg" ]; then
    line80=$(awk '/^[[:space:]]*listen[[:space:]]/ && /80/ { gsub(/;/,""); print $2; exit }' "$cfg" || true)
    line443=$(awk '/^[[:space:]]*listen[[:space:]]/ && /443/ { gsub(/;/,""); print $2; exit }' "$cfg" || true)
    if [ -n "${line80:-}" ]; then LISTEN_80="$line80"; fi
    if [ -n "${line443:-}" ]; then LISTEN_443="$line443"; fi
  fi
  if [ "$LISTEN_80" = "80" ] && [ -f "$APP_ENV" ]; then
    local ip
    ip=$(awk -F= '/^PLESK_IP_ADDRESS=/{v=$2} END{print v}' "$APP_ENV" | tr -d "\"'" || true)
    if [ -n "${ip:-}" ]; then
      LISTEN_80="${ip}:80"
      LISTEN_443="${ip}:443"
    fi
  fi
}

ensure_reload_hook() {
  # Production already has this hook; it requires the cert directory as $1.
  # Never overwrite it. acme.sh --reloadcmd must pass that argument.
  if [ -e "$RELOAD_HOOK" ]; then
    log "using existing $RELOAD_HOOK"
    return
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would write $RELOAD_HOOK"
    return
  fi
  cat >"$RELOAD_HOOK" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
CERTDIR="${1:-}"
if [ -n "$CERTDIR" ]; then
  chmod 600 "$CERTDIR/privkey.pem" 2>/dev/null || true
  chmod 644 "$CERTDIR/fullchain.pem" 2>/dev/null || true
fi
nginx -t && systemctl reload nginx
HOOK
  chmod 700 "$RELOAD_HOOK"
}

# The existing *.preview.legenex.com cert stores ACMEDNS_* on its domain conf.
# account.conf does not. A new preview.pageflo.io issue would otherwise register
# a fresh acme-dns account and block on `read`. Reuse the live account: both
# wildcards already CNAME to the same acme-dns subdomain.
load_acmedns_creds() {
  local conf="$ACME_HOME/*.preview.legenex.com_ecc/*.preview.legenex.com.conf"
  if [ ! -f "$conf" ]; then
    die "missing $conf; cannot reuse the live acme-dns account for DNS-01"
  fi
  # shellcheck disable=SC1090
  set -a
  # Source only the four ACMEDNS assignments. The rest of the domain conf is
  # acme.sh internals for a different certificate.
  eval "$(grep -E '^ACMEDNS_(BASE_URL|USERNAME|PASSWORD|SUBDOMAIN)=' "$conf")"
  set +a
  if [ -z "${ACMEDNS_USERNAME:-}" ] || [ -z "${ACMEDNS_PASSWORD:-}" ] || [ -z "${ACMEDNS_SUBDOMAIN:-}" ]; then
    die "ACMEDNS credentials were not present on the live preview.legenex.com cert"
  fi
  export ACMEDNS_BASE_URL ACMEDNS_USERNAME ACMEDNS_PASSWORD ACMEDNS_SUBDOMAIN
  log "loaded acme-dns account from preview.legenex.com (values not printed)"
}

load_acme_account() {
  if [ -f "$ACME_HOME/account.conf" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ACME_HOME/account.conf"
    set +a
  fi
  load_acmedns_creds
}

cert_files_ok() {
  local dir="$1"
  [ -s "$dir/fullchain.pem" ] && [ -s "$dir/privkey.pem" ]
}

cert_has_san() {
  local pem="$1"
  local needle="$2"
  [ -s "$pem" ] || return 1
  openssl x509 -in "$pem" -noout -text 2>/dev/null | grep -F "$needle" >/dev/null
}

require_sans() {
  local pem="$1"
  shift
  local needle
  for needle in "$@"; do
    cert_has_san "$pem" "$needle" || die "certificate $pem is missing SAN $needle"
  done
}

acme_is_ecc() {
  local domain="$1"
  [ -d "$ACME_HOME/${domain}_ecc" ]
}

install_issued() {
  local domain="$1"
  local dir="$2"
  mkdir -p "$dir"
  local extra=()
  if acme_is_ecc "$domain"; then
    extra+=(--ecc)
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would install-cert $domain -> $dir"
    return
  fi
  "$ACME_SH" --install-cert -d "$domain" "${extra[@]}" \
    --fullchain-file "$dir/fullchain.pem" \
    --key-file "$dir/privkey.pem" \
    --reloadcmd "$RELOAD_HOOK $dir"
  cert_files_ok "$dir" || die "acme.sh install-cert left $dir without cert files"
}

# acme.sh exits 0 on issue/renew and 2 when the cert is present and not due.
acme_issue_ok() {
  local code="$1"
  [ "$code" -eq 0 ] || [ "$code" -eq 2 ]
}

issue_http01() {
  local main="$1"
  shift
  local args=(--issue --server "$LE_SERVER" --webroot "$ACME_WEBROOT" --keylength ec-256 -d "$main")
  local extra
  for extra in "$@"; do
    args+=(-d "$extra")
  done
  mkdir -p "$ACME_CERT_ROOT/${main}"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would HTTP-01 issue ${main} $*"
    return
  fi
  set +e
  "$ACME_SH" "${args[@]}"
  local code=$?
  set -e
  if acme_issue_ok "$code"; then
    return
  fi
  die "HTTP-01 issue failed for $main (acme.sh exit $code)"
}

issue_wildcard_dns01() {
  local base="$1"
  local wild="*.${base}"
  mkdir -p "$ACME_CERT_ROOT/${base}"
  load_acme_account
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would DNS-01 issue ${wild} and ${base}"
    return
  fi
  set +e
  # stdin closed so a missing-cred path cannot block on acme.sh's `read`.
  "$ACME_SH" --issue --server "$LE_SERVER" --dns dns_acmedns \
    -d "$wild" -d "$base" --keylength ec-256 </dev/null
  local code=$?
  set -e
  if acme_issue_ok "$code"; then
    return
  fi
  die "DNS-01 issue failed for $wild (acme.sh exit $code)"
}

force_http01() {
  local main="$1"
  shift
  local args=(--issue --server "$LE_SERVER" --webroot "$ACME_WEBROOT" --keylength ec-256 --force -d "$main")
  local extra
  for extra in "$@"; do
    args+=(-d "$extra")
  done
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would HTTP-01 --force issue ${main} $*"
    return
  fi
  "$ACME_SH" "${args[@]}"
}

force_wildcard_dns01() {
  local base="$1"
  local wild="*.${base}"
  load_acme_account
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would DNS-01 --force issue ${wild} and ${base}"
    return
  fi
  "$ACME_SH" --issue --server "$LE_SERVER" --dns dns_acmedns \
    -d "$wild" -d "$base" --keylength ec-256 --force </dev/null
}

write_http_bootstrap() {
  local file="$1"
  local names="$2"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would write HTTP bootstrap $file ($names)"
    return
  fi
  cat >"$file" <<EOF
# PageFlo control-plane ACME bootstrap. Do not make this default_server.
server {
    listen ${LISTEN_80};
    server_name ${names};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }
    location / {
        proxy_pass ${PROXY};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
    }
}
EOF
}

write_vhost() {
  local file="$1"
  local names="$2"
  local certdir="$3"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would write TLS vhost $file ($names) cert=$certdir"
    return
  fi
  cat >"$file" <<EOF
# PageFlo control-plane. Do not make this default_server.
server {
    listen ${LISTEN_80};
    server_name ${names};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen ${LISTEN_443} ssl;
    http2 on;
    server_name ${names};
    ssl_certificate     ${certdir}/fullchain.pem;
    ssl_certificate_key ${certdir}/privkey.pem;
    client_max_body_size 50m;
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }
    location / {
        proxy_pass ${PROXY};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
}

BACKUP_DIR=""
backup_file() {
  local file="$1"
  [ -n "$BACKUP_DIR" ] || return 0
  if [ -f "$file" ]; then
    cp -a "$file" "$BACKUP_DIR/$(basename "$file")"
  fi
}

restore_backups() {
  if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    return
  fi
  local f
  for f in "$VHOST_APEX" "$VHOST_APP" "$VHOST_PREVIEW" "${STRAY_VHOSTS[@]}"; do
    local bak="$BACKUP_DIR/$(basename "$f")"
    if [ -f "$bak" ]; then
      cp -a "$bak" "$f"
    else
      rm -f "$f"
    fi
  done
}

reload_nginx() {
  if ! nginx -t; then
    restore_backups
    nginx -t >/dev/null 2>&1 || true
    die "nginx -t failed; previous vhost files restored; not reloading"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "dry-run: would reload nginx"
    return
  fi
  systemctl reload nginx
}

remove_stray_vhosts() {
  local f
  for f in "${STRAY_VHOSTS[@]}"; do
    if [ -f "$f" ]; then
      log "removing stray vhost $(basename "$f") so it cannot outrank wildcard or steal default SNI"
      if [ "$DRY_RUN" -eq 0 ]; then
        rm -f "$f"
      fi
    fi
  done
}

http01_ready() {
  local dir="$1"
  shift
  cert_files_ok "$dir" || return 1
  local needle
  for needle in "$@"; do
    cert_has_san "$dir/fullchain.pem" "$needle" || return 1
  done
  return 0
}

ensure_http01_host() {
  local vhost="$1"
  local names="$2"
  local main="$3"
  shift 3
  local dir="$ACME_CERT_ROOT/${main}"
  mkdir -p "$dir"

  if http01_ready "$dir" "$main" "$@"; then
    log "$main already has a valid certificate; skipping issue"
    install_issued "$main" "$dir"
    write_vhost "$vhost" "$names" "$dir"
    return
  fi

  write_http_bootstrap "$vhost" "$names"
  reload_nginx
  issue_http01 "$main" "$@"
  install_issued "$main" "$dir"
  if [ "$DRY_RUN" -eq 0 ] && ! http01_ready "$dir" "$main" "$@"; then
    log "$main cert missing required SAN; forcing one reissue"
    force_http01 "$main" "$@"
    install_issued "$main" "$dir"
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    require_sans "$dir/fullchain.pem" "$main" "$@"
  fi
  write_vhost "$vhost" "$names" "$dir"
}

ensure_preview_wildcard() {
  local base="preview.pageflo.io"
  local dir="$ACME_CERT_ROOT/${base}"
  local wild="*.${base}"
  mkdir -p "$dir"

  if http01_ready "$dir" "$wild" "$base"; then
    log "$wild already has a valid certificate; skipping issue"
    install_issued "$wild" "$dir"
    write_vhost "$VHOST_PREVIEW" "${base} ${wild}" "$dir"
    return
  fi

  issue_wildcard_dns01 "$base"
  install_issued "$wild" "$dir"
  if [ "$DRY_RUN" -eq 0 ] && ! http01_ready "$dir" "$wild" "$base"; then
    log "$wild cert missing required SAN; forcing one reissue"
    force_wildcard_dns01 "$base"
    install_issued "$wild" "$dir"
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    require_sans "$dir/fullchain.pem" "$wild" "$base"
  fi
  write_vhost "$VHOST_PREVIEW" "${base} ${wild}" "$dir"
}

need_root
infer_listen
log "listen 80=${LISTEN_80} 443=${LISTEN_443}"

if [ ! -x "$ACME_SH" ]; then
  die "acme.sh missing at $ACME_SH"
fi

mkdir -p "$NGINX_DIR" "$ACME_WEBROOT" "$ACME_CERT_ROOT"
ensure_reload_hook

if [ "$DRY_RUN" -eq 0 ]; then
  BACKUP_DIR=$(mktemp -d /tmp/pageflo-vhost-bak.XXXXXX)
  for f in "$VHOST_APEX" "$VHOST_APP" "$VHOST_PREVIEW" "${STRAY_VHOSTS[@]}"; do
    backup_file "$f"
  done
fi

remove_stray_vhosts

ensure_http01_host "$VHOST_APEX" "pageflo.io www.pageflo.io" pageflo.io www.pageflo.io
ensure_http01_host "$VHOST_APP" "app.pageflo.io" app.pageflo.io
ensure_preview_wildcard

remove_stray_vhosts
reload_nginx

if [ "$DRY_RUN" -eq 0 ] && [ -n "$BACKUP_DIR" ]; then
  rm -rf "$BACKUP_DIR"
fi

log "app.pageflo.io HTTP-01 and *.preview.pageflo.io DNS-01 installed"
log "legacy preview.legenex.com and os.legenex.com were not modified"
