// =====================================================================
// FornecedoresPage.ts — a tela de fornecedores (só ADMIN)
// ---------------------------------------------------------------------
// Pense num arquivo de fichas de empresas. A tela tem duas partes:
//   1. o FORMULÁRIO (escondido até clicar em "Novo fornecedor" ou
//      "Editar"), com o botão mágico "Buscar CNPJ": digita o CNPJ, clica,
//      e a ficha se preenche sozinha com os dados da Receita;
//   2. a LISTA, com os botões Editar e Excluir em cada empresa.
//
// O "Buscar CNPJ" só SUGERE: preenche os campos para o ADMIN conferir.
// Nada é salvo até ele clicar em "Salvar".
//
// Mesmo padrão da UsuariosPage (Caio): nada de onclick="..." no HTML,
// todo texto do banco passa pelo escapar(), erros vêm de resposta.erro.
// =====================================================================

import type { Fornecedor } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

/** O que o "Buscar CNPJ" devolve (a ficha sem id e sem importado). */
type FichaDaReceita = Omit<Fornecedor, 'id' | 'importado'>;

export class FornecedoresPage {
  private app!: HTMLElement;
  private fornecedores: Fornecedor[] = [];
  private idEmEdicao: number | null = null; // null = cadastrando um novo

  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Fornecedores</h2>
        <button type="button" id="fornecedores-novo" class="btn btn-primary">Novo fornecedor</button>
      </div>
      <div id="fornecedores-alerta"></div>

      <div id="fornecedores-form-card" class="card mb-3 d-none">
        <div class="card-body">
          <h3 id="fornecedores-form-titulo" class="h6 mb-3"></h3>
          <form id="fornecedores-form" class="row g-3" novalidate>
            <div class="col-md-5">
              <label for="fornecedores-cnpj" class="form-label">CNPJ</label>
              <div class="input-group">
                <input id="fornecedores-cnpj" class="form-control" maxlength="18"
                       placeholder="00.000.000/0000-00" inputmode="numeric">
                <button type="button" id="fornecedores-buscar" class="btn btn-outline-primary">Buscar CNPJ</button>
              </div>
              <div class="form-text">Digite o CNPJ e clique em "Buscar" para preencher os dados.</div>
            </div>
            <div class="col-md-7">
              <label for="fornecedores-razao" class="form-label">Razão social</label>
              <input id="fornecedores-razao" class="form-control" maxlength="150">
            </div>
            <div class="col-md-5">
              <label for="fornecedores-fantasia" class="form-label">Nome fantasia</label>
              <input id="fornecedores-fantasia" class="form-control" maxlength="150">
            </div>
            <div class="col-md-3">
              <label for="fornecedores-telefone" class="form-label">Telefone</label>
              <input id="fornecedores-telefone" class="form-control" maxlength="20">
            </div>
            <div class="col-md-3">
              <label for="fornecedores-cidade" class="form-label">Cidade</label>
              <input id="fornecedores-cidade" class="form-control" maxlength="80">
            </div>
            <div class="col-md-1">
              <label for="fornecedores-uf" class="form-label">UF</label>
              <input id="fornecedores-uf" class="form-control text-uppercase" maxlength="2">
            </div>
            <div class="col-12">
              <div class="form-check">
                <input id="fornecedores-importado" type="checkbox" class="form-check-input">
                <label for="fornecedores-importado" class="form-check-label">
                  Vende produtos importados (custo em dólar)
                </label>
              </div>
            </div>
            <div class="col-12">
              <button type="submit" id="fornecedores-salvar" class="btn btn-success">Salvar</button>
              <button type="button" id="fornecedores-cancelar" class="btn btn-outline-secondary ms-2">Cancelar</button>
            </div>
          </form>
        </div>
      </div>

      <div class="table-responsive">
      <table class="table table-striped align-middle bg-white border">
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>CNPJ</th>
            <th>Cidade</th>
            <th>Telefone</th>
            <th>Importado</th>
            <th class="text-end">Ações</th>
          </tr>
        </thead>
        <tbody id="fornecedores-lista">
          <tr><td colspan="6" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>
      </div>`;

    // Ligações dos botões (uma vez só, ao abrir a tela)
    this.el('fornecedores-novo').addEventListener('click', () => this.abrirFormulario());
    this.el('fornecedores-cancelar').addEventListener('click', () => this.fecharFormulario());
    this.el('fornecedores-buscar').addEventListener('click', () => void this.buscarCnpj());
    this.el('fornecedores-form').addEventListener('submit', (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página
      void this.salvar();
    });
    // Um único "ouvinte" na lista (delegação de eventos, como na UsuariosPage)
    this.el('fornecedores-lista').addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });

    await this.carregar();
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Busca os fornecedores no Main e desenha a tabela. */
  private async carregar(): Promise<void> {
    const resposta = await window.api.chamar<Fornecedor[]>('fornecedores:listar');
    const lista = this.el('fornecedores-lista');

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    this.fornecedores = resposta.dados;
    if (this.fornecedores.length === 0) {
      lista.innerHTML =
        '<tr><td colspan="6" class="text-secondary">Nenhum fornecedor cadastrado.</td></tr>';
      return;
    }
    lista.innerHTML = this.fornecedores.map((f) => this.linha(f)).join('');
  }

  /** O HTML de uma linha. Todo texto do banco passa pelo escapar(). */
  private linha(f: Fornecedor): string {
    // Mostra o nome fantasia (o "nome do dia a dia"); a razão social
    // fica embaixo, menor. Sem fantasia, mostra só a razão social.
    const nome = f.nome_fantasia
      ? `${escapar(f.nome_fantasia)}<div class="small text-secondary">${escapar(f.razao_social)}</div>`
      : escapar(f.razao_social);
    const cidade = f.cidade ? `${escapar(f.cidade)}${f.uf ? ` - ${escapar(f.uf)}` : ''}` : '-';
    const importado = f.importado
      ? '<span class="badge text-bg-warning">US$</span>'
      : '<span class="text-secondary">Não</span>';

    return `
      <tr>
        <td>${nome}</td>
        <td class="text-nowrap">${escapar(this.formatarCnpj(f.cnpj))}</td>
        <td>${cidade}</td>
        <td>${escapar(f.telefone ?? '-')}</td>
        <td>${importado}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${f.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${f.id}">Excluir</button>
        </td>
      </tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(acao: string, id: number): Promise<void> {
    const fornecedor = this.fornecedores.find((f) => f.id === id);
    if (!fornecedor) return;

    if (acao === 'editar') this.abrirFormulario(fornecedor);
    if (acao === 'excluir') {
      const nome = fornecedor.nome_fantasia ?? fornecedor.razao_social;
      const certeza = await confirmar(
        'Excluir fornecedor',
        `Excluir "${nome}"? Esta ação não pode ser desfeita.`,
        'Excluir',
      );
      if (!certeza) return;

      const resposta = await window.api.chamar<void>('fornecedores:excluir', id);
      if (!resposta.ok) {
        // Ex.: "Este registro está em uso e não pode ser excluído."
        this.alerta('danger', resposta.erro);
        return;
      }
      if (this.idEmEdicao === id) this.fecharFormulario();
      await this.carregar();
      this.alerta('success', `Fornecedor "${nome}" excluído.`);
    }
  }

  // -------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------

  /** Mostra o formulário: vazio (novo) ou preenchido (editar). */
  private abrirFormulario(fornecedor?: Fornecedor): void {
    this.idEmEdicao = fornecedor?.id ?? null;
    this.el('fornecedores-form-titulo').textContent = fornecedor
      ? `Editar: ${fornecedor.nome_fantasia ?? fornecedor.razao_social}`
      : 'Novo fornecedor';

    this.input('fornecedores-cnpj').value = fornecedor ? this.formatarCnpj(fornecedor.cnpj) : '';
    this.preencherFicha(fornecedor ?? null);
    this.input('fornecedores-importado').checked = fornecedor?.importado ?? false;

    this.el('fornecedores-form-card').classList.remove('d-none');
    this.input('fornecedores-cnpj').focus();
  }

  private fecharFormulario(): void {
    this.idEmEdicao = null;
    this.el('fornecedores-form-card').classList.add('d-none');
  }

  /** Coloca os dados de uma ficha nos campos (null = limpa tudo). */
  private preencherFicha(ficha: FichaDaReceita | null): void {
    this.input('fornecedores-razao').value = ficha?.razao_social ?? '';
    this.input('fornecedores-fantasia').value = ficha?.nome_fantasia ?? '';
    this.input('fornecedores-telefone').value = ficha?.telefone ?? '';
    this.input('fornecedores-cidade').value = ficha?.cidade ?? '';
    this.input('fornecedores-uf').value = ficha?.uf ?? '';
  }

  /** Botão "Buscar CNPJ": pede a ficha ao Main e preenche os campos. */
  private async buscarCnpj(): Promise<void> {
    const botao = this.el('fornecedores-buscar') as HTMLButtonElement;
    botao.disabled = true;
    botao.textContent = 'Buscando...';
    const resposta = await window.api.chamar<FichaDaReceita>(
      'fornecedores:buscarCnpj',
      this.input('fornecedores-cnpj').value,
    );
    botao.disabled = false;
    botao.textContent = 'Buscar CNPJ';

    if (!resposta.ok) {
      // Ex.: "CNPJ inválido." ou "Não foi possível consultar o CNPJ agora..."
      this.alerta('danger', resposta.erro);
      return;
    }
    this.input('fornecedores-cnpj').value = this.formatarCnpj(resposta.dados.cnpj);
    this.preencherFicha(resposta.dados);
    this.alerta('info', 'Dados preenchidos com o cadastro da Receita. Confira antes de salvar.');
  }

  /** Envia para o Main. Sem id = cadastrar; com id = editar. */
  private async salvar(): Promise<void> {
    const dados = {
      ...(this.idEmEdicao === null ? {} : { id: this.idEmEdicao }),
      cnpj: this.input('fornecedores-cnpj').value,
      razao_social: this.input('fornecedores-razao').value,
      nome_fantasia: this.input('fornecedores-fantasia').value,
      telefone: this.input('fornecedores-telefone').value,
      cidade: this.input('fornecedores-cidade').value,
      uf: this.input('fornecedores-uf').value,
      importado: this.input('fornecedores-importado').checked, // sempre true ou false
    };

    // Desliga o botão enquanto espera: evita salvar duas vezes
    const botao = this.el('fornecedores-salvar') as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar<number>('fornecedores:salvar', dados);
    botao.disabled = false;

    if (!resposta.ok) {
      // Ex.: "Já existe um fornecedor com esse CNPJ."
      this.alerta('danger', resposta.erro);
      return;
    }
    const editou = this.idEmEdicao !== null;
    this.fecharFormulario();
    await this.carregar();
    this.alerta('success', editou ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
  }

  // -------------------------------------------------------------------
  // Atalhos
  // -------------------------------------------------------------------

  /** "19131243000197" -> "19.131.243/0001-97" (só para mostrar). */
  private formatarCnpj(cnpj: string): string {
    const d = String(cnpj ?? '').replace(/\D/g, '');
    if (d.length !== 14) return cnpj;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  private el(id: string): HTMLElement {
    return this.app.querySelector(`#${id}`) as HTMLElement;
  }

  private input(id: string): HTMLInputElement {
    return this.el(id) as HTMLInputElement;
  }

  private alerta(tipo: TipoAlerta, mensagem: string): void {
    mostrarAlerta(this.el('fornecedores-alerta'), tipo, mensagem);
  }
}
