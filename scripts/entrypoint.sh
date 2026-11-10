#!/bin/sh
# Container entrypoint: export the Key Vault secrets mounted by the Secrets Store CSI driver
# (SecretProviderClass platform-services-secrets), then exec the server. Missing files are
# skipped so the image also runs without the mount; the server then answers 503 for the
# routes that need them. Never print the values.
set -eu

secrets_dir=${PLATFORM_SECRETS_DIR:-/mnt/secrets}
if [ -f "$secrets_dir/platform-services-admin-token" ]; then
  NUXT_ADMIN_TOKEN=$(cat "$secrets_dir/platform-services-admin-token")
  export NUXT_ADMIN_TOKEN
fi
if [ -f "$secrets_dir/platform-services-hmac-key" ]; then
  NUXT_HMAC_KEY=$(cat "$secrets_dir/platform-services-hmac-key")
  export NUXT_HMAC_KEY
fi

exec "$@"
