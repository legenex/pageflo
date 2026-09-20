#!/usr/bin/env bash
# Idempotent host-side vhosts + certificates for PageFlo control-plane hosts.
# Run as root on the Plesk box. Does not change DNS. Does not revoke certs.
# Does not touch os.legenex.com or *.preview.legenex.com.
#
# Filenames sort after crashclaim.co.conf so unmatched SNI still presents
# crashclaim.co. Never write app.pageflo.io.conf (that would steal default SNI).
#
# app.pageflo.io / pageflo.io: HTTP-01
# *.preview.pageflo.io: DNS-01 via the existing acme-dns account (same CNAME
# target as preview.legenex.com). A certificate that only lists preview.pageflo.io
# or test.preview.pageflo.io is a failure.

set -euo pipefail

NGINX_DIR=/etc/nginx/conf.d/legalos-tenants
ACME_WEBROOT=/var/www/vhosts/default/htdocs
ACME_CERT_ROOT=/etc/ssl/legalos
ACME_SH=/root/.acme.sh/acme.sh
RELOAD_HOOK=/root/legalos-reload-nginx-cert.sh
PROXY=http://127.0.0.1:3000

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "run as root on the production host" >&2
    exit 1
  fi
}

write_vhost() {
  local file="$1"
  local names="$2"
  local certdir="$3"
  cat >"$file" <<EOF
# PageFlo control-plane. Do not make this default_server.
server {
    listen 80;
    server_name ${names};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
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

write_http_bootstrap() {
  local file="$1"
  local names="$2"
  cat >"$file" <<EOF
server {
    listen 80;
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

issue_http01() {
  local main="$1"
  shift
  local args=(-d "$main")
  local extra
  for extra in "$@"; do
    args+=(-d "$extra")
  done
  mkdir -p "$ACME_CERT_ROOT/${main}"
  "$ACME_SH" --issue --webroot "$ACME_WEBROOT" "${args[@]}" --keylength ec-256 --force || \
    "$ACME_SH" --issue --webroot "$ACME_WEBROOT" "${args[@]}" --keylength ec-256 || true
  "$ACME_SH" --install-cert -d "$main" --ecc \
    --fullchain-file "$ACME_CERT_ROOT/${main}/fullchain.pem" \
    --key-file "$ACME_CERT_ROOT/${main}/privkey.pem" \
    --reloadcmd "$RELOAD_HOOK"
}

issue_wildcard_dns01() {
  local base="$1"
  mkdir -p "$ACME_CERT_ROOT/${base}"
  # Reuse the acme-dns credentials already used for preview.legenex.com.
  # Do not print account.conf.
  set -a
  # shellcheck disable=SC1091
  [ -f /root/.acme.sh/account.conf ] && . /root/.acme.sh/account.conf
  set +a
  "$ACME_SH" --issue --dns dns_acmedns \
    -d "*.${base}" -d "${base}" \
    --keylength ec-256 || \
    "$ACME_SH" --issue --dns dns_acmedns \
      -d "*.${base}" -d "${base}" \
      --keylength ec-256 --force
  "$ACME_SH" --install-cert -d "*.${base}" --ecc \
    --fullchain-file "$ACME_CERT_ROOT/${base}/fullchain.pem" \
    --key-file "$ACME_CERT_ROOT/${base}/privkey.pem" \
    --reloadcmd "$RELOAD_HOOK"
  openssl x509 -in "$ACME_CERT_ROOT/${base}/fullchain.pem" -noout -text \
    | grep -E 'DNS:' | grep -F "*.${base}" >/dev/null
}

need_root
mkdir -p "$NGINX_DIR" "$ACME_WEBROOT"

if [ ! -x "$ACME_SH" ]; then
  echo "acme.sh missing at $ACME_SH" >&2
  exit 1
fi

# HTTP-01 bootstrap, then issue, then TLS vhosts. Names sort after crashclaim.co.
write_http_bootstrap "$NGINX_DIR/pageflo.io.conf" "pageflo.io www.pageflo.io"
write_http_bootstrap "$NGINX_DIR/pageflo-app.pageflo.io.conf" "app.pageflo.io"
nginx -t && systemctl reload nginx

issue_http01 pageflo.io www.pageflo.io
write_vhost "$NGINX_DIR/pageflo.io.conf" "pageflo.io www.pageflo.io" "$ACME_CERT_ROOT/pageflo.io"

issue_http01 app.pageflo.io
write_vhost "$NGINX_DIR/pageflo-app.pageflo.io.conf" "app.pageflo.io" "$ACME_CERT_ROOT/app.pageflo.io"

issue_wildcard_dns01 preview.pageflo.io
write_vhost "$NGINX_DIR/preview.pageflo.io.conf" "preview.pageflo.io *.preview.pageflo.io" "$ACME_CERT_ROOT/preview.pageflo.io"

# Never leave a stray per-host vhost that would outrank the wildcard.
rm -f "$NGINX_DIR/test.preview.pageflo.io.conf" "$NGINX_DIR/app.pageflo.io.conf"

nginx -t && systemctl reload nginx
echo "provision-pageflo-hosts: app.pageflo.io HTTP-01 and *.preview.pageflo.io DNS-01 installed"
