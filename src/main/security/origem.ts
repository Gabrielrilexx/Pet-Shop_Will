// =====================================================================
// origem.ts — "este endereço é do NOSSO sistema?"
// ---------------------------------------------------------------------
// A tela do sistema vem de um lugar só:
//   - durante o desenvolvimento (npm start): o servidor do Vite
//     (http://localhost:5173);
//   - no programa instalado: o arquivo index.html empacotado (file://).
//
// Esta regra é usada em dois lugares, por isso fica escrita UMA vez:
//   - IpcRouter: só atende pedidos que vêm da nossa página;
//   - main.ts: a janela só navega (ou recarrega) dentro da nossa página.
// =====================================================================

export function ehEnderecoDoSistema(url: string): boolean {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  }
  return url.startsWith('file://');
}
