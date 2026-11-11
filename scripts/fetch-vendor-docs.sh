#!/usr/bin/env bash
# Скачивает документацию библиотек стека в docs/vendor/.
# Версии и коммиты закреплены ниже. При обновлении библиотеки меняется её
# строка здесь, скрипт запускается заново, результат коммитится целиком.
# Файлы в docs/vendor/ руками не правятся.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# fetch <имя> <репозиторий> <коммит> <пути для sparse-checkout...>
fetch() {
  local name=$1 repo=$2 sha=$3; shift 3
  local dir="$TMP/$name"
  git init -q "$dir"
  git -C "$dir" remote add origin "https://github.com/$repo.git"
  git -C "$dir" sparse-checkout set "$@"
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
  rm -rf "${OUT:?}/$name"
  mkdir -p "$OUT/$name"
}

# take <имя> <путь в репозитории> <путь в docs/vendor/имя> — из папок копирует только .md и .mdx
take() {
  local src="$TMP/$1/$2" dst="$OUT/$1/$3"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    (cd "$src" && find . -type f \( -name '*.md' -o -name '*.mdx' \) -exec cp --parents {} "$dst" \;)
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
  fi
}

# --- Phaser 4.2.1 (MIT) ---
fetch phaser phaserjs/phaser 41be1e462bc600064e498cba370bfa8c5c055a22 skills docs changelog
take phaser LICENSE.md LICENSE.md
take phaser skills skills
take phaser docs guides
for f in 4.0/MIGRATION-GUIDE.md 4.0/CHANGELOG-v4.0.0.md 4.1/CHANGELOG-v4.1.0.md 4.2/CHANGELOG-v4.2.0.md 4.2.1/CHANGELOG-v4.2.1.md; do
  take phaser "changelog/v4/$f" "changelog/$(basename "$f")"
done

# --- Vite 8.3.8 (MIT) ---
fetch vite vitejs/vite b39e6e63dcbfc3cf4be871acf3554efbd6d0e268 docs
take vite LICENSE LICENSE
take vite docs/guide guide
take vite docs/config config
take vite docs/changes changes

# --- Vitest 5.1.0 (MIT) ---
fetch vitest vitest-dev/vitest 7a3844954d8753fc0d5bed76a96ffd3a21716c22 docs
take vitest LICENSE LICENSE
take vitest docs/guide guide
take vitest docs/config config
take vitest docs/api api
rm -rf "$OUT/vitest/guide/browser"

# --- Zod 4.6.7 (MIT) ---
fetch zod colinhacks/zod b500a2ee95134f81d74da7911d7378dd2853d042 packages/docs/content
take zod LICENSE LICENSE
take zod packages/docs/content .
rm -rf "$OUT/zod/blog"

# --- Knip (ISC) ---
fetch knip webpro-nl/knip e2be1a314f05023f9180b94461279d91ed01609f packages/docs/src/content/docs
take knip LICENSE LICENSE
for d in overview features guides explanations reference typescript; do
  take knip "packages/docs/src/content/docs/$d" "$d"
done

# --- pnpm (MIT) ---
fetch pnpm pnpm/pnpm.io 831d6fdd34ef2d520df6f6cf06fa8721c621565a docs
take pnpm LICENSE LICENSE
for f in workspaces catalogs filtering settings scripts package_json pnpm-cli installation \
         continuous-integration migration migration-v11 typescript supply-chain-security \
         workspace-task-orchestration agent-skills errors; do
  take pnpm "docs/$f.md" "$f.md"
done
take pnpm docs/cli cli
take pnpm docs/settings settings

# --- React 19: только статьи о выпусках (CC BY 4.0) ---
fetch react reactjs/react.dev 46a54e0592729712b7640308b53268e84fdc7c9f src/content/blog
take react LICENSE-DOCS.md LICENSE-DOCS.md
for f in 2024/04/25/react-19-upgrade-guide.md 2024/12/05/react-19.md 2025/10/01/react-19-2.md \
         2025/10/07/react-compiler-1.md 2026/09/09/react-19-3.md; do
  take react "src/content/blog/$f" "$(basename "$f")"
done

# --- Capacitor 8 (Apache-2.0) ---
fetch capacitor ionic-team/capacitor-docs 29ef1d452eab56cd0d87b753fc2ba95f44f889f7 docs
take capacitor LICENSE LICENSE
for d in getting-started basics android guides reference web; do
  take capacitor "docs/main/$d" "$d"
done
take capacitor docs/cli cli
for f in 7-0 8-0 8-5; do take capacitor "docs/main/updating/$f.md" "updating/$f.md"; done

# --- Tauri 2 (MIT) ---
fetch tauri tauri-apps/tauri-docs 82b9083fea3fa2b6e539c8a74c3404a6c8513b5f src/content/docs
take tauri LICENSE LICENSE
for d in start develop distribute concept security reference; do
  take tauri "src/content/docs/$d" "$d"
done

# --- TypeScript 7: отличия нового компилятора (Apache-2.0) ---
fetch typescript microsoft/typescript-go 89d5d5b2849a0db0957065889ca58536fa6d2e4a _docs
take typescript LICENSE LICENSE-typescript-go
take typescript CHANGES.md CHANGES-7.0.md

# --- TypeScript: заметки о выпуске 6.0 и справочник tsconfig (CC BY 4.0) ---
fetch tsweb microsoft/TypeScript-Website a93dd416c393cbc7570b829a9e0c753b2678249f packages/documentation/copy/en/release-notes packages/tsconfig-reference/copy/en
cp "$TMP/tsweb/LICENSE" "$OUT/typescript/LICENSE-docs"
cp "$TMP/tsweb/packages/documentation/copy/en/release-notes/TypeScript 6.0.md" "$OUT/typescript/release-notes-6.0.md"
mkdir -p "$OUT/typescript/tsconfig"
(cd "$TMP/tsweb/packages/tsconfig-reference/copy/en" && find . -type f -name '*.md' -exec cp --parents {} "$OUT/typescript/tsconfig" \;)
rm -rf "$OUT/tsweb"

echo "Готово: $(du -sh "$OUT" | cut -f1) в docs/vendor"
