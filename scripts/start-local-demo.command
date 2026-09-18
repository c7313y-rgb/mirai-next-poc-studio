#!/bin/bash
# Finderから起動できる、既存ローカルデモ用ランチャー。
set -u
script_dir="$(cd "$(dirname "$0")" && pwd)"
node_exec=""
accept_node() {
  [[ -x "$1" ]] || return 1
  "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' >/dev/null 2>&1 || return 1
  node_exec="$1"
}
if [[ -n "${MIRAI_NODE:-}" ]]; then accept_node "$MIRAI_NODE" || true; fi
if [[ -z "$node_exec" ]]; then
  from_path="$(command -v node 2>/dev/null || true)"
  if [[ -n "$from_path" ]]; then accept_node "$from_path" || true; fi
fi
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
  if [[ -z "$node_exec" ]]; then accept_node "$candidate" || true; fi
done
if [[ -z "$node_exec" ]]; then
  echo "Node.js 22.13以上が見つかりません。Nodeをインストールするか、MIRAI_NODEで実行ファイルを指定してください。"
  result=1
else
  cd "$script_dir/.." || exit 1
  echo "副担任mirAI NEXT の設定と起動状態を確認しています…"
  "$node_exec" "$script_dir/local-demo.mjs" start --open
  result=$?
fi
if [[ -t 0 ]]; then
  echo ""
  read -r -p "Enterで終了します（起動済みサーバーは動作を続けます）。" _reply
fi
exit "$result"
