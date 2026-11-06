#!/usr/bin/env bash
# Builds the production image, checks it against a running container, and with --push publishes it.
#
#   deploy/build-image.sh           build for this machine and check it
#   deploy/build-image.sh --push    then build every platform and push them to the registry
#
# Settings come from the environment, or else from .env (see .env.example):
#   IMAGE_REGISTRY     the registry to push to; needed for --push
#   IMAGE_NAMESPACE    the namespace inside it; needed for --push
#   IMAGE_NAME         default learn-solar-system
#   IMAGE_PLATFORMS    default linux/amd64,linux/arm64
#   TILE_YEARS         the years of data, default 2000-2050
#   BUILDX_BUILDER     default learn-solar-system, created on first use to hold this project's cache
#
# The data is built inside the image. The first build downloads JPL's 33 MB kernel and asks Horizons
# 9 questions for each year. The builder keeps both, so a later build asks only about new years.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

push=false
case "${1-}" in
  "") ;;
  --push) push=true ;;
  -h | --help)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Unknown option \"$1\". Use --push, or nothing." >&2
    exit 2
    ;;
esac

# Reads one setting from .env without running the file, unless the environment already has it.
setting() {
  local name=$1 line value
  if [ -n "${!name-}" ]; then return; fi
  [ -f .env ] || return 0
  line=$(grep -E "^${name}=" .env | tail -n 1 || true)
  [ -n "$line" ] || return 0
  value=${line#*=}
  value=${value%\"}
  value=${value#\"}
  printf -v "$name" '%s' "$value"
}
for name in IMAGE_REGISTRY IMAGE_NAMESPACE IMAGE_NAME IMAGE_PLATFORMS TILE_YEARS BUILDX_BUILDER; do setting "$name"; done
IMAGE_NAME=${IMAGE_NAME:-learn-solar-system}
IMAGE_PLATFORMS=${IMAGE_PLATFORMS:-linux/amd64,linux/arm64}
TILE_YEARS=${TILE_YEARS:-2000-2050}
export BUILDX_BUILDER=${BUILDX_BUILDER:-learn-solar-system}

if $push && { [ -z "${IMAGE_REGISTRY-}" ] || [ -z "${IMAGE_NAMESPACE-}" ]; }; then
  echo "Set IMAGE_REGISTRY and IMAGE_NAMESPACE, in .env or the environment, to push. See .env.example." >&2
  exit 1
fi

# An image names a commit, so it must hold nothing that commit does not.
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash these changes first, so that the image matches a commit:" >&2
  git status --short >&2
  exit 1
fi

commit=$(git rev-parse HEAD)
short=$(git rev-parse --short=12 HEAD)
created=$(git log -1 --format=%cI HEAD)

if ! docker buildx inspect "$BUILDX_BUILDER" > /dev/null 2>&1; then
  echo "Creating the buildx builder \"$BUILDX_BUILDER\", which keeps this project's build cache."
  docker buildx create --name "$BUILDX_BUILDER" --driver docker-container > /dev/null
fi

build=(docker buildx build --file deploy/Dockerfile
  --build-arg "TILE_YEARS=$TILE_YEARS" --build-arg "REVISION=$commit" --build-arg "CREATED=$created")

echo "Building $short for this machine, with $TILE_YEARS of data."
"${build[@]}" --load --tag "$IMAGE_NAME:local" .

# Docker's own choice of port can collide on a rootless daemon, so this picks a free one and retries.
container=""
for attempt in 1 2 3; do
  port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
  if container=$(docker run --detach --rm --publish "127.0.0.1:$port:8080" "$IMAGE_NAME:local"); then break; fi
  container=""
  echo "Port $port was taken (attempt $attempt of 3)." >&2
done
[ -n "$container" ] || { echo "Could not start the image." >&2; exit 1; }
trap 'docker stop "$container" > /dev/null' EXIT
base="http://127.0.0.1:$port"
curl --silent --output /dev/null --retry 20 --retry-delay 1 --retry-connrefused --retry-all-errors "$base/healthz"
echo "Checking $base"
deploy/check-image.sh "$base"

if ! $push; then
  echo "Built and checked $IMAGE_NAME:local. Run it with: docker run --rm --publish 8080:8080 $IMAGE_NAME:local"
  exit 0
fi

# The registry keeps these three families of tags: sha-<commit>, latest, and version numbers.
repository="$IMAGE_REGISTRY/$IMAGE_NAMESPACE/$IMAGE_NAME"
tags=(--tag "$repository:sha-$short" --tag "$repository:latest")
for version in $(git tag --points-at HEAD | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true); do
  tags+=(--tag "$repository:$version")
done

echo "Pushing $IMAGE_PLATFORMS to $repository"
"${build[@]}" --platform "$IMAGE_PLATFORMS" "${tags[@]}" --push .
docker buildx imagetools inspect "$repository:sha-$short" | sed -n '1,3p'
