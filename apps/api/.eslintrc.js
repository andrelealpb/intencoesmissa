module.exports = {
  root: true,
  extends: ["@missas/eslint-config"],
  // Sem `parserOptions.project`: @missas/eslint-config nao habilita nenhuma
  // regra type-aware, entao o typed-linting so causava erro de parse nos
  // *.spec.ts (excluidos do tsconfig). Specs seguem lintados sintaticamente.
};
