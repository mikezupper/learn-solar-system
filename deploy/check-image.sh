#!/usr/bin/env bash
# Checks a running copy of the production image: every cache rule, the security headers, and that a
# tile arrives whole. build-image.sh runs it before anything is pushed, and so does CI.
#
#   deploy/check-image.sh http://127.0.0.1:8080
#
# Needs curl, python3 and sha256sum.
set -euo pipefail

base=${1:?Usage: deploy/check-image.sh <base URL of a running container>}
base=${base%/}

YEAR="public, max-age=31536000, immutable"
ALWAYS_ASK="no-cache"
HOUR="public, max-age=3600"
NEVER="no-store"

failures=0
pass() { printf 'ok    %s\n' "$*"; }
note() { printf 'note  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  failures=$((failures + 1))
}

# Prints a response's status line and headers, with any extra curl arguments.
headers_of() {
  local path=$1
  shift
  curl --silent --show-error --output /dev/null --dump-header - "$@" "$base$path" | tr -d '\r'
}

# Prints the value of one header from the output of headers_of.
header() {
  printf '%s\n' "$1" | awk -v name="$2" 'tolower($1) == tolower(name) ":" { sub(/^[^:]*:[ \t]*/, ""); print; exit }'
}

status_of() { printf '%s\n' "$1" | awk 'NR == 1 { print $2 }'; }

# Checks the status and Cache-Control of one path.
expect_cache() {
  local what=$1 path=$2 status=$3 cache=$4
  shift 4
  local response got_status got_cache
  response=$(headers_of "$path" "$@")
  got_status=$(status_of "$response")
  got_cache=$(header "$response" Cache-Control)
  if [ "$got_status" = "$status" ] && [ "$got_cache" = "$cache" ]; then
    pass "$what: $got_status, $got_cache"
  else
    fail "$what ($path): expected $status with \"$cache\", got ${got_status:-nothing} with \"$got_cache\""
  fi
}

# Checks that one header of a path contains a piece of text.
expect_header() {
  local what=$1 path=$2 name=$3 wanted=$4
  shift 4
  local value
  value=$(header "$(headers_of "$path" "$@")" "$name")
  if [[ "$value" == *"$wanted"* ]]; then
    pass "$what: $name: $value"
  else
    fail "$what ($path): expected $name to contain \"$wanted\", got \"$value\""
  fi
}

# Checks that a cache holding one of the files with a fixed name can ask whether it changed.
# Last-Modified must work. A copy dated a day later, as after a rollback, must get the file again,
# so the date has to match exactly. An ETag is checked when one arrives: some CDNs drop it from
# pages, and browsers then ask with Last-Modified alone.
expect_revalidation() {
  local path=$1 response modified later etag
  response=$(headers_of "$path")
  modified=$(header "$response" Last-Modified)
  etag=$(header "$response" ETag)
  if [ -n "$modified" ]; then
    later=$(python3 -c '
import datetime, email.utils, sys
date = email.utils.parsedate_to_datetime(sys.argv[1]) + datetime.timedelta(days=1)
print(email.utils.format_datetime(date, usegmt=True))' "$modified")
    expect_cache "$path, unchanged since its Last-Modified" "$path" 304 "$ALWAYS_ASK" --header "If-Modified-Since: $modified"
    expect_cache "$path, from a later release" "$path" 200 "$ALWAYS_ASK" --header "If-Modified-Since: $later"
  else
    fail "$path sends no Last-Modified, so a cache cannot ask whether it changed"
  fi
  if [ -n "$etag" ]; then
    expect_cache "$path, unchanged since its ETag" "$path" 304 "$ALWAYS_ASK" --header "If-None-Match: $etag"
    expect_cache "$path, with another ETag" "$path" 200 "$ALWAYS_ASK" --header 'If-None-Match: "0-0"'
  else
    note "$path sends no ETag, as when a CDN drops it; browsers ask with Last-Modified instead"
  fi
}

page=$(curl --silent --show-error --fail "$base/")
assets=$(printf '%s' "$page" | grep -oE '/assets/[^"]+\.(js|css)' | sort -u)
[ -n "$assets" ] || fail "the page names no script or stylesheet under /assets"
stylesheet=$(printf '%s\n' "$assets" | grep -E '\.css$' | head -n 1)
script=$(printf '%s\n' "$assets" | grep -E '\.js$' | head -n 1)
fonts=$(curl --silent --show-error --fail "$base$stylesheet" | grep -oE '/assets/[^")]+\.woff2' | sort -u)
[ -n "$fonts" ] || fail "the stylesheet names no font under /assets"

echo "Pages, and the one data file with a fixed name: asked about every time"
expect_cache "the page" / 200 "$ALWAYS_ASK"
expect_cache "a link to a moment" "/?at=2026-08-12T17:46:00Z" 200 "$ALWAYS_ASK"
expect_cache "the data page" /about-the-data.html 200 "$ALWAYS_ASK"
expect_cache "the catalog of years" /tiles/catalog.json 200 "$ALWAYS_ASK"
expect_header "the catalog of years" /tiles/catalog.json Content-Type application/json

echo "Files named after their contents: kept for a year"
for path in $assets $fonts; do expect_cache "$(basename "$path")" "$path" 200 "$YEAR"; done

catalog=$(curl --silent --show-error --fail "$base/tiles/catalog.json")
read -r blob sha256 bytes < <(printf '%s' "$catalog" | python3 -c '
import json, sys
tile = json.load(sys.stdin)["tiles"][0]
print(tile["blob"], tile["sha256"], tile["byteLength"])')
expect_cache "a year of data" "/tiles/$blob" 200 "$YEAR"
expect_header "a year of data" "/tiles/$blob" Content-Type application/octet-stream
received=$(curl --silent --show-error --fail "$base/tiles/$blob" | sha256sum | cut -d' ' -f1)
if [ "$received" = "$sha256" ]; then pass "$blob arrives whole: its SHA-256 matches the catalog"; else fail "$blob arrived as $received, but the catalog says $sha256"; fi
length=$(curl --silent --show-error --fail "$base/tiles/$blob" | wc -c | tr -d ' ')
if [ "$length" = "$bytes" ]; then pass "$blob is $bytes bytes, as the catalog says"; else fail "$blob is $length bytes, but the catalog says $bytes"; fi

echo "Everything else: kept for an hour"
expect_cache "a font license" /fonts/OFL-Doto.txt 200 "$HOUR"

echo "Errors and the health check: never kept"
expect_cache "a missing script" /assets/missing-0000.js 404 "$NEVER"
expect_cache "a missing year" /tiles/planets-1900-0000000000000000.bin 404 "$NEVER"
expect_cache "a folder" /tiles/ 404 "$NEVER"
expect_cache "the health check" /healthz 200 "$NEVER"

echo "Revalidation: an unchanged file costs a 304, and any other copy gets the file again"
for path in / /about-the-data.html /tiles/catalog.json; do expect_revalidation "$path"; done

echo "Compression"
expect_header "a script" "$script" Content-Encoding gzip --header "Accept-Encoding: gzip"
expect_header "a script" "$script" Vary Accept-Encoding --header "Accept-Encoding: gzip"
expect_header "the catalog of years" /tiles/catalog.json Content-Encoding gzip --header "Accept-Encoding: gzip"
plain=$(header "$(headers_of "$script")" Content-Encoding)
if [ -z "$plain" ]; then pass "a client that asks for no compression gets none"; else fail "a client that asked for no compression got $plain"; fi

echo "Security headers, on pages and on errors"
for path in / /assets/missing-0000.js; do
  expect_header "$path" "$path" Content-Security-Policy "default-src 'self'"
  expect_header "$path" "$path" X-Content-Type-Options nosniff
  expect_header "$path" "$path" Referrer-Policy strict-origin-when-cross-origin
  expect_header "$path" "$path" Strict-Transport-Security "max-age="
done
server=$(header "$(headers_of /)" Server)
if [[ "$server" =~ [0-9] ]]; then fail "the Server header names a version: $server"; else pass "the Server header names no version"; fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
echo "Every check passed."
