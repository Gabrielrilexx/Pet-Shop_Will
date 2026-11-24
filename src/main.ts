// =====================================================================
// main.ts — o "GERENTE" do programa (processo Main)
// ---------------------------------------------------------------------
// É o primeiro arquivo que roda. Ele:
//   1. liga todos os canais IPC (cada módulo tem sua linha aqui);
//   2. cria a janela do sistema, com as travas de segurança;
//   3. fecha o programa quando a janela é fechada.
//
// ARQUIVO COMPARTILHADO: cada integrante só ACRESCENTA as linhas da
// sua parte, na sua seção (import lá em cima, registrar lá embaixo).
// =====================================================================

import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { IpcRouter } from './main/ipc/IpcRouter';
import { ehEnderecoDoSistema } from './main/security/origem';

// --- Integrante 1 ----------------------------------------------------
import { registrarAuthIpc } from './main/ipc/authIpc';
import { registrarUsuariosIpc } from './main/ipc/usuariosIpc';
// --- Integrante 2 ----------------------------------------------------
import { registrarClientesIpc } from './main/ipc/clientesIpc';
import { registrarEntregadoresIpc } from './main/ipc/entregadoresIpc';
// --- Integrante 3 ----------------------------------------------------
import { registrarCatalogoIpc } from './main/ipc/catalogoIpc';
import { registrarFornecedoresIpc } from './main/ipc/fornecedoresIpc';
import { registrarProdutosIpc } from './main/ipc/produtosIpc';
import { registrarInicioIpc } from './main/ipc/inicioIpc';
// --- Integrante 4 ----------------------------------------------------
import { registrarPedidosIpc } from './main/ipc/pedidosIpc';
import { registrarEntregasIpc } from './main/ipc/entregasIpc';
// Instalador do Windows: ao instalar/desinstalar, só cria os atalhos e sai.
if (started) {
  app.quit();
}

/** Liga TODOS os canais do sistema no garçom (IpcRouter). */
function registrarTodosOsCanais(): void {
  const router = new IpcRouter();

  // --- Integrante 1 --------------------------------------------------
  registrarAuthIpc(router);
  registrarUsuariosIpc(router);
  // --- Integrante 2 --------------------------------------------------
  registrarClientesIpc(router);
  registrarEntregadoresIpc(router);
  // --- Integrante 3 --------------------------------------------------
  registrarCatalogoIpc(router);
  registrarFornecedoresIpc(router);
  registrarProdutosIpc(router);
  registrarInicioIpc(router);
  // --- Integrante 4 --------------------------------------------------
  registrarPedidosIpc(router);
  registrarEntregasIpc(router);
}

function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Pet Shop DAD',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),

      // As 3 travas de segurança da janela (cada uma explicada no README):
      contextIsolation: true, // a tela e o preload vivem em "mundos" separados
      nodeIntegration: false, // a tela NÃO tem acesso ao Node (arquivos, banco...)
      sandbox: true, // a tela roda numa "caixa de areia", como um site
    },
  });

  // Trava extra: a janela nunca sai do nosso sistema. Um link para
  // fora abre no navegador do computador, e não dentro do programa.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  // Navegar para um endereço de fora: bloqueado. Recarregar a NOSSA
  // página é permitido (o Vite recarrega sozinho ao salvar um arquivo).
  janela.webContents.on('will-navigate', (evento) => {
    if (!ehEnderecoDoSistema(evento.url)) {
      evento.preventDefault();
    }
  });

  // Carrega a tela: no npm start vem do servidor do Vite; no programa
  // instalado, do arquivo index.html empacotado.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void janela.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    janela.webContents.openDevTools(); // DevTools só durante o desenvolvimento
  } else {
    void janela.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// Quando o Electron termina de iniciar: liga os canais e abre a janela.
void app.whenReady().then(() => {
  registrarTodosOsCanais();
  criarJanela();

  // macOS: clicar no ícone reabre a janela se nenhuma estiver aberta.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanela();
    }
  });
});

// Fechou a janela: fecha o programa (menos no macOS, que é o costume de lá).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
