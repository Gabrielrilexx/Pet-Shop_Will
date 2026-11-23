// =====================================================================
// CatalogoPage.ts — a tela de espécies e categorias
// ---------------------------------------------------------------------
// Pense em duas "fichas" lado a lado num quadro de cortiça: uma com as
// espécies (cachorro, gato...) e outra com as categorias (ração,
// brinquedo...). Cada ficha tem:
//   - um campo para escrever um nome novo (ou corrigir um existente);
//   - a lista, com os botões Editar e Excluir em cada linha.
//
// As duas fichas funcionam EXATAMENTE igual: muda só o nome do canal
// ('especies:...' ou 'categorias:...'). Por isso a tela descreve cada
// uma numa "Secao" e usa os MESMOS métodos para as duas, em vez de
// escrever tudo duas vezes.
//
// Quem pode o quê (tabela de permissões):
//   ADMIN     -> vê, cadastra, edita e exclui
//   ATENDENTE -> só vê (o formulário e os botões nem aparecem)
// Esconder é só CONFORTO: quem barra de verdade é o IpcRouter, no Main.
//
// Regras da tela (CSP do Caio): nada de onclick="..." no HTML; todo
// texto do banco passa pelo escapar(); erros vêm de resposta.erro.
// =====================================================================

import type { Categoria, Especie, UsuarioSemSenha } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';

/** Espécie e categoria têm o mesmo formato: { id, nome }. */
type ItemCatalogo = Especie | Categoria;

/** Tudo o que muda de uma ficha para a outra. */
interface Secao {
  chave: 'especies' | 'categorias'; // início do nome do canal e dos ids do HTML
  titulo: string; // "Espécies"
  item: string; // "espécie" (para as mensagens)
  itens: ItemCatalogo[]; // o que veio do banco na última carga
  idEmEdicao: number | null; // null = cadastrando um novo
}

export class CatalogoPage {
  private app!: HTMLElement;
  private ehAdmin = false;

  private readonly secoes: Secao[] = [
    { chave: 'especies', titulo: 'Espécies', item: 'espécie', itens: [], idEmEdicao: null },
    { chave: 'categorias', titulo: 'Categorias', item: 'categoria', itens: [], idEmEdicao: null },
  ];

  async render(app: HTMLElement): Promise<void> {
    this.app = app;

    // Quem está logado? Só para decidir o que MOSTRAR (conforto).
    const atual = await window.api.chamar<UsuarioSemSenha>('auth:atual');
    this.ehAdmin = atual.ok && atual.dados.perfil === 'ADMIN';

    app.innerHTML = `
      <h2 class="h4 mb-3">Catálogo</h2>
      <div id="catalogo-alerta"></div>
      <div class="row g-3">
        ${this.secoes.map((secao) => this.htmlDaSecao(secao)).join('')}
      </div>`;

    for (const secao of this.secoes) {
      this.ligarEventos(secao);
    }
    // As duas listas carregam ao mesmo tempo
    await Promise.all(this.secoes.map((secao) => this.carregar(secao)));
  }

  // -------------------------------------------------------------------
  // Montagem da tela
  // -------------------------------------------------------------------

  /** O HTML de uma ficha (o formulário só aparece para o ADMIN). */
  private htmlDaSecao(secao: Secao): string {
    const id = `catalogo-${secao.chave}`;
    const formulario = this.ehAdmin
      ? `
        <form id="${id}-form" class="d-flex gap-2 mb-3" novalidate>
          <input id="${id}-nome" class="form-control" maxlength="50"
                 placeholder="Nome da nova ${secao.item}" aria-label="Nome da ${secao.item}">
          <button type="submit" id="${id}-salvar" class="btn btn-success text-nowrap">Adicionar</button>
          <button type="button" id="${id}-cancelar" class="btn btn-outline-secondary d-none">Cancelar</button>
        </form>`
      : '';

    return `
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-body">
            <h3 class="h5 mb-3">${secao.titulo}</h3>
            ${formulario}
            <table class="table table-striped align-middle mb-0">
              <tbody id="${id}-lista">
                <tr><td class="text-secondary">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  /** Liga os botões de uma ficha (uma vez só, ao abrir a tela). */
  private ligarEventos(secao: Secao): void {
    if (!this.ehAdmin) return; // ATENDENTE não tem botões

    const id = `catalogo-${secao.chave}`;
    this.el(`${id}-form`).addEventListener('submit', (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página
      void this.salvar(secao);
    });
    this.el(`${id}-cancelar`).addEventListener('click', () => this.modoNovo(secao));

    // Um único "ouvinte" na lista descobre qual botão foi clicado pelos
    // atributos data-acao e data-id (mesma técnica da UsuariosPage).
    this.el(`${id}-lista`).addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(secao, botao.dataset.acao ?? '', Number(botao.dataset.id));
    });
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Busca a lista no Main e desenha a tabela da ficha. */
  private async carregar(secao: Secao): Promise<void> {
    const resposta = await window.api.chamar<ItemCatalogo[]>(`${secao.chave}:listar`);
    const lista = this.el(`catalogo-${secao.chave}-lista`);

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    secao.itens = resposta.dados;
    if (secao.itens.length === 0) {
      lista.innerHTML = `<tr><td class="text-secondary">Nenhuma ${secao.item} cadastrada.</td></tr>`;
      return;
    }
    lista.innerHTML = secao.itens.map((item) => this.linha(item)).join('');
  }

  /** O HTML de uma linha. O nome vem do banco: passa pelo escapar(). */
  private linha(item: ItemCatalogo): string {
    const botoes = this.ehAdmin
      ? `<td class="text-end text-nowrap">
           <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${item.id}">Editar</button>
           <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${item.id}">Excluir</button>
         </td>`
      : '';
    return `<tr><td>${escapar(item.nome)}</td>${botoes}</tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(secao: Secao, acao: string, id: number): Promise<void> {
    const item = secao.itens.find((i) => i.id === id);
    if (!item) return;

    if (acao === 'editar') {
      this.modoEditar(secao, item);
    }
    if (acao === 'excluir') {
      const certeza = await confirmar(
        `Excluir ${secao.item}`,
        `Excluir a ${secao.item} "${item.nome}"? Esta ação não pode ser desfeita.`,
        'Excluir',
      );
      if (!certeza) return;

      const resposta = await window.api.chamar<void>(`${secao.chave}:excluir`, id);
      if (!resposta.ok) {
        // Ex.: "Este registro está em uso e não pode ser excluído."
        this.alerta('danger', resposta.erro);
        return;
      }
      if (secao.idEmEdicao === id) this.modoNovo(secao);
      await this.carregar(secao);
      this.alerta('success', `${this.maiuscula(secao.item)} "${item.nome}" excluída.`);
    }
  }

  // -------------------------------------------------------------------
  // Formulário (o mesmo campo serve para cadastrar e para editar)
  // -------------------------------------------------------------------

  /** Campo vazio, botão "Adicionar": pronto para cadastrar. */
  private modoNovo(secao: Secao): void {
    const id = `catalogo-${secao.chave}`;
    secao.idEmEdicao = null;
    this.input(`${id}-nome`).value = '';
    this.el(`${id}-salvar`).textContent = 'Adicionar';
    this.el(`${id}-cancelar`).classList.add('d-none');
  }

  /** Campo com o nome atual, botão "Salvar": pronto para corrigir. */
  private modoEditar(secao: Secao, item: ItemCatalogo): void {
    const id = `catalogo-${secao.chave}`;
    secao.idEmEdicao = item.id;
    this.input(`${id}-nome`).value = item.nome;
    this.el(`${id}-salvar`).textContent = 'Salvar';
    this.el(`${id}-cancelar`).classList.remove('d-none');
    this.input(`${id}-nome`).focus();
  }

  /** Envia para o Main. Sem id = cadastrar; com id = editar. */
  private async salvar(secao: Secao): Promise<void> {
    const id = `catalogo-${secao.chave}`;
    const nome = this.input(`${id}-nome`).value;
    const dados = secao.idEmEdicao === null ? { nome } : { id: secao.idEmEdicao, nome };

    // Desliga o botão enquanto espera: evita salvar duas vezes com
    // dois cliques rápidos.
    const botao = this.el(`${id}-salvar`) as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar<number>(`${secao.chave}:salvar`, dados);
    botao.disabled = false;

    if (!resposta.ok) {
      // Ex.: "Já existe uma espécie com esse nome."
      this.alerta('danger', resposta.erro);
      return;
    }
    const editou = secao.idEmEdicao !== null;
    this.modoNovo(secao);
    await this.carregar(secao);
    this.alerta('success', `${this.maiuscula(secao.item)} ${editou ? 'atualizada' : 'cadastrada'}.`);
  }

  // -------------------------------------------------------------------
  // Atalhos
  // -------------------------------------------------------------------

  private el(id: string): HTMLElement {
    return this.app.querySelector(`#${id}`) as HTMLElement;
  }

  private input(id: string): HTMLInputElement {
    return this.el(id) as HTMLInputElement;
  }

  private alerta(tipo: 'success' | 'danger', mensagem: string): void {
    mostrarAlerta(this.el('catalogo-alerta'), tipo, mensagem);
  }

  /** "espécie" -> "Espécie" (para começar a frase com maiúscula). */
  private maiuscula(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}
