// =====================================================================
// global.d.ts — ensina o TypeScript que a tela tem um "window.api"
// ---------------------------------------------------------------------
// O window.api é criado pelo preload.ts. Sem este arquivo, o TypeScript
// sublinharia de vermelho todo "window.api.chamar(...)", porque ele não
// sabe que essa porta existe. Aqui dizemos: "existe, e o formato é o
// mesmo do api do preload".
// =====================================================================

import type { Api } from '../preload';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
