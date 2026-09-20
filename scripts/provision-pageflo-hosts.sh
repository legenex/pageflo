#!/usr/bin/env bash
# Idempotent host-side vhost + HTTP-01 certs for PageFlo control-plane hosts.
# Run as root on the Plesk box. Does not change DNS. Does not revoke certs.
# Wildcard *.preview.pageflo.io needs DNS-01 (_acme-challenge CNAME) and is
# skipped unless that record already exists.

set -euo pipefail

NGINX_DIR=/etc/nginx/conf.d/legalos-tenants
ACME_WEBROOT=/var/www/vhosts/default/htdocs
ACME_CERT_ROOT=/etc/ssl/legalos
ACME_SH=/root/.acme.sh/acme.sh
RELOAD_HOOK=/root/legalos-reload-nginx-cert.sh
PROXY=http://127.0.0.1:3000
EMAIL="${PLESK_OWNER_EMAIL:-team@legenex.com}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "run as root on the production host" >&2
    exit 1
  fi
}

write_bootstrap() {
  local host="$1"
  local file="$NGINX_DIR/${host}.conf"
  cat >"$file" <<EOF
# PageFlo control-plane ACME bootstrap: ${host}
server {
    listen 80;
    server_name ${host};
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
    }
}
EOF
}

write_tls() {
  local host="$1"
  local names="$2"
  local certdir="$ACME_CERT_ROOT/${host}"
  local file="$NGINX_DIR/${host}.conf"
  cat >"$file" <<EOF
# PageFlo control-plane: ${host}
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

issue_http01() {
  local main="$1"
  shift
  local extras=("$@")
  local certdir="$ACME_CERT_ROOT/${main}"
  mkdir -p "$certdir"
  local args=(-d "$main")
  local extra
  for extra in "${extras[@]}"; do
    args+=(-d "$extra")
  done
  "$ACME_SH" --issue --webroot "$ACME_WEBROOT" "${args[@]}" --keylength ec-256 || true
  "$ACME_SH" --install-cert -d "$main" --ecc \
    --fullchain-file "$certdir/fullchain.pem" \
    --key-file "$certdir/privkey.pem" \
    --reloadcmd "$RELOAD_HOOK" || return 1
}

need_root
mkdir -p "$NGINX_DIR" "$ACME_WEBROOT"

write_bootstrap pageflo.io
write_bootstrap app.pageflo.io
write_bootstrap preview.pageflo.io
nginx -t && systemctl reload nginx

issue_http01 pageflo.io www.pageflo.io
write_tls pageflo.io "pageflo.io www.pageflo.io"
issue_http01 app.pageflo.io
write_tls app.pageflo.io app.pageflo.io
issue_http01 preview.pageflo.io test.preview.pageflo.io
write_tls preview.pageflo.io "preview.pageflo.io test.preview.pageflo.io *.preview.pageflo.io"

nginx -t && systemctl reload nginx
echo "provision-pageflo-hosts: nginx reloaded"
