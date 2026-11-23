// =====================================================================
// renderer.ts — o "RECEPCIONISTA" da tela
// ---------------------------------------------------------------------
// É o primeiro código que roda na janela. Ele:
//   1. carrega o visual (Bootstrap + nosso CSS);
//   2. monta o menu a partir do rotas.ts;
//   3. abre a página certa quando um item do menu é clicado.
//
// A navegação usa o "#" do endereço (#usuarios, #clientes...): clicar
// num item troca o #, e o evento "hashchange" avisa que é hora de
// trocar de página. Assim a tela nunca recarrega inteira.
//
// A tela NÃO fala com o banco: tudo passa por window.api.chamar(...).
// =====================================================================

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap'; // parte JavaScript do Bootstrap (fechar alertas, janelas modais...)
import './index.css';
import { ROTAS } from './renderer/rotas';
import { mostrarAlerta } from './renderer/ui';

const app = document.getElementById('app') as HTMLElement;
const menu = document.getElementById('menu') as HTMLElement;

/** Cria um item de menu para cada rota. */
function montarMenu(): void {
  const itens = ROTAS.map((rota) => {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = `#${rota.id}`;
    link.dataset.rota = rota.id;
    link.textContent = rota.titulo; // textContent: o texto nunca vira HTML

    li.append(link);
    return li;
  });
  menu.replaceChildren(...itens);
}

/** Marca no menu qual item está aberto. */
function marcarAtivo(id: string): void {
  menu.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.rota === id);
  });
}

/** Tela mostrada quando nenhuma página está aberta. */
function telaDeBoasVindas(): void {
  app.innerHTML = `
    <div class="p-5 bg-white rounded-3 border">
      <h1 class="h3">Bem-vindo ao Pet Shop 🐾</h1>
      <p class="text-secondary mb-0">Escolha uma opção no menu acima.</p>
    </div>`;
}

/** Abre a página da rota com esse id (o que vem depois do # no endereço). */
async function abrir(id: string): Promise<void> {
  marcarAtivo(id);
  const rota = ROTAS.find((r) => r.id === id);
  if (!rota) {
    telaDeBoasVindas();
    return;
  }

  app.replaceChildren(); // limpa a página anterior
  try {
    await rota.criar().render(app);
  } catch (erro) {
    // Se a página quebrar, o sistema não fica em branco: mostra um aviso.
    console.error(`[renderer] Erro ao abrir a página "${id}":`, erro);
    mostrarAlerta(app, 'danger', 'Não foi possível abrir esta tela.');
  }
}

/** Pega o id da página atual a partir do endereço (#usuarios -> usuarios). */
const paginaAtual = (): string => window.location.hash.slice(1);

window.addEventListener('hashchange', () => void abrir(paginaAtual()));

montarMenu();
void abrir(paginaAtual());
