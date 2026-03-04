#!/bin/bash
# 越水はるかAI - 不要ファイル削除スクリプト
# 実行前に内容を確認してください

echo "🗑  以下のファイルを削除します："
echo ""

FILES=(
  "backups/"
  "server.js.bak"
  "server.js.bak2"
  "server.js.bak_rootfix2"
  "server.js.before_improve"
  "index_old.html"
  "headers.txt"
  ".DS_Store"
  "sources/.DS_Store"
)

for f in "${FILES[@]}"; do
  if [ -e "$f" ]; then
    echo "  ✓ $f"
  fi
done

echo ""
read -p "削除を実行しますか？ (y/N): " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  for f in "${FILES[@]}"; do
    rm -rf "$f" 2>/dev/null
  done
  echo "✅ 削除完了"
else
  echo "❌ キャンセルしました"
fi
