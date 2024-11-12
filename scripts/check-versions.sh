#!/bin/bash
set -e -o pipefail
cd "$(dirname "$0")/.."

grep_versions=$(grep -EirH 'version.*([0-9]+\.[0-9]+\.[0-9]+)' dist/g2s.mjs dist/g2s-m.mjs src/ package.json)
unique_versions=$(echo "$grep_versions" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u | wc -l)

if (( unique_versions == 1 )); then
  exit 0
fi

echo "Error: バージョン不一致エラー（以下のファイルのバージョンを揃えて下さい）"
echo "$grep_versions" | grep --color -E '[0-9]+\.[0-9]+\.[0-9]+'
exit 1
