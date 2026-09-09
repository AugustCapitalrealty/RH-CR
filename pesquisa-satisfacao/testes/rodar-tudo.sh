#!/usr/bin/env bash
# Roda todas as suítes. Uso:  bash testes/rodar-tudo.sh
set -u
cd "$(dirname "$0")/.."
falhou=0
for t in testes/*.test.js; do
  printf '\n\033[1m── %s ──\033[0m\n' "$t"
  node "$t" || falhou=1
done
echo
[ $falhou -eq 0 ] && echo "✅ Todas as suítes passaram." || echo "❌ Alguma suíte falhou."
exit $falhou
