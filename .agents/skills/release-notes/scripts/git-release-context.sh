#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--tag TAG | --target-tag TAG [--from-tag TAG]]" >&2
  exit 2
}

TAG=""
TARGET_TAG=""
FROM_TAG=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) [ "$#" -ge 2 ] || usage; TAG="$2"; shift 2 ;;
    --target-tag) [ "$#" -ge 2 ] || usage; TARGET_TAG="$2"; shift 2 ;;
    --from-tag) [ "$#" -ge 2 ] || usage; FROM_TAG="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done

if [ -n "$TAG" ] && [ -n "$TARGET_TAG" ]; then usage; fi
if [ -z "$TAG" ] && [ -z "$TARGET_TAG" ]; then
  TAG="$(git tag --sort=-v:refname | head -n 1)"
  [ -n "$TAG" ] || { echo "No tags found; use --target-tag for a planned release." >&2; exit 1; }
fi

if [ -n "$TAG" ]; then
  git rev-parse -q --verify "refs/tags/$TAG^{commit}" >/dev/null || { echo "Tag not found: $TAG" >&2; exit 1; }
  TAG_COMMIT="$(git rev-parse "$TAG^{commit}")"
  TAG_DATE="$(git log -1 --format=%aI "$TAG_COMMIT")"
  TAG_SUBJECT="$(git log -1 --format=%s "$TAG_COMMIT")"
  PREVIOUS_TAG="$(git tag --sort=-v:refname --merged "$TAG_COMMIT" | awk -v tag="$TAG" 'seen {print; exit} $0 == tag {seen=1}')"
  if [ -n "$PREVIOUS_TAG" ]; then
    RANGE="$PREVIOUS_TAG..$TAG"
  else
    RANGE="$TAG (initial history)"
  fi
else
  TAG="$TARGET_TAG"
  TAG_COMMIT="$(git rev-parse HEAD)"
  TAG_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  TAG_SUBJECT="Planned release $TARGET_TAG"
  if [ -z "$FROM_TAG" ]; then
    PREVIOUS_TAG=""
    RANGE="HEAD (initial history)"
  else
    git rev-parse -q --verify "refs/tags/$FROM_TAG^{commit}" >/dev/null || { echo "From tag not found: $FROM_TAG" >&2; exit 1; }
    PREVIOUS_TAG="$FROM_TAG"
    RANGE="$FROM_TAG..HEAD"
  fi
fi

INITIAL_RELEASE=false
[ -n "$PREVIOUS_TAG" ] || INITIAL_RELEASE=true

printf 'TAG=%s\nTAG_COMMIT=%s\nTAG_DATE=%s\nTAG_SUBJECT=%s\nPREVIOUS_TAG=%s\nRANGE=%s\nINITIAL_RELEASE=%s\n' \
  "$TAG" "$TAG_COMMIT" "$TAG_DATE" "$TAG_SUBJECT" "$PREVIOUS_TAG" "$RANGE" "$INITIAL_RELEASE"
printf '\n[COMMITS]\n'
if [ "$INITIAL_RELEASE" = true ]; then
  git log --reverse --format='%h %aI %s' "$TAG_COMMIT"
elif [ -n "$TARGET_TAG" ]; then
  git log --reverse --format='%h %aI %s' "$FROM_TAG..$TAG_COMMIT"
else
  git log --reverse --format='%h %aI %s' "$PREVIOUS_TAG..$TAG_COMMIT"
fi
printf '\n[STAT]\n'
if [ "$INITIAL_RELEASE" = true ]; then
  ROOT_COMMIT="$(git rev-list --max-parents=0 --reverse "$TAG_COMMIT" | head -n 1)"
  git diff --stat "${ROOT_COMMIT}^{tree}" "${TAG_COMMIT}^{tree}"
elif [ -n "$TARGET_TAG" ]; then
  git diff --stat "$FROM_TAG..$TAG_COMMIT"
else
  git diff --stat "$PREVIOUS_TAG..$TAG_COMMIT"
fi
