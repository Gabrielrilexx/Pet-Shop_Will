// =====================================================================
// ProdutosPage.ts — a tela de produtos
// ---------------------------------------------------------------------
// A "vitrine" da loja. Duas partes:
//   1. o FORMULÁRIO (só ADMIN), com o botão "Calcular preço": a partir
//      do custo (em reais ou dólar) e da margem, o Main SUGERE um preço
//      de venda. O ADMIN decide se usa a sugestão; nada muda sozinho.
//   2. a LISTA. O estoque abaixo do mínimo aparece em vermelho.
//
// Quem vê o quê (tabela de permissões):
//   ADMIN     -> tudo: custo, margem, fornecedor, formulário e botões
//   ATENDENTE -> só nome, preço e estoque. O custo e a margem NEM CHEGAM
//               na tela dele: são cortados no Main (ProdutoService). Aqui
//               a tela só deixa de desenhar as colunas que vieram vazias.
//
// Mesmo padrão da UsuariosPage (Caio): nada de onclick="..." no HTML,
// todo texto do banco passa pelo escapar(), erros vêm de resposta.erro.
// =====================================================================

import type {
  Categoria,
  Especie,
  Fornecedor,
  MoedaCusto,
  Produto,
  UsuarioSemSenha,
} from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

/** O ATENDENTE recebe o produto sem custo e margem (corte do Main). */
type ProdutoNaTela = Omit<Produto, 'custo' | 'margem_percentual'> &
  Partial<Pick<Produto, 'custo' | 'margem_percentual'>>;

/** O que o canal produtos:cotacao devolve. */
interface Sugestao {
  cotacao: number | null; // null quando o custo já está em reais
  custo_em_reais: number;
  preco_sugerido: number;
}

// Formata números como dinheiro brasileiro: 83.29 -> "R$ 83,29"
const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DOLAR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
// A cotação tem 4 casas (5,9488): com 2, a conta da tela não "fecharia"
const COTACAO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 4,
});

export class ProdutosPage {
  private app!: HTMLElement;
  private ehAdmin = false;
  private produtos: ProdutoNaTela[] = [];
  private idEmEdicao: number | null = null;
  private sugerido: number | null = null; // último preço sugerido

  // "Dicionários" id -> nome, para mostrar "Ração" em vez de "1"
  private especies = new Map<number, string>();
  private categorias = new Map<number, string>();
  private fornecedores = new Map<number, string>();

  async render(app: HTMLElement): Promise<void> {
    this.app = app;

    const atual = await window.api.chamar<UsuarioSemSenha>('auth:atual');
    this.ehAdmin = atual.ok && atual.dados.perfil === 'ADMIN';

    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Produtos</h2>
        ${this.ehAdmin ? '<button type="button" id="produtos-novo" class="btn btn-primary">Novo produto</button>' : ''}
      </div>
      <div id="produtos-alerta"></div>
      ${this.ehAdmin ? this.htmlDoFormulario() : ''}
      <div class="table-responsive">
      <table class="table table-striped align-middle bg-white border">
        <thead><tr>${this.htmlDoCabecalho()}</tr></thead>
        <tbody id="produtos-lista">
          <tr><td colspan="7" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>
      </div>`;

    if (this.ehAdmin) this.ligarEventos();

    // Os nomes de espécies, categorias e fornecedores chegam ANTES da
    // lista, para a tabela já sair com os nomes certos.
    await this.carregarDicionarios();
    await this.carregar();
  }

  // -------------------------------------------------------------------
  // Montagem da tela
  // -------------------------------------------------------------------

  private htmlDoCabecalho(): string {
    return this.ehAdmin
      ? `<th>Produto</th><th>Fornecedor</th><th class="text-end">Custo</th>
         <th class="text-end">Margem</th><th class="text-end">Preço</th>
         <th class="text-end">Estoque</th><th class="text-end">Ações</th>`
      : `<th>Produto</th><th class="text-end">Preço</th><th class="text-end">Estoque</th>`;
  }

  private htmlDoFormulario(): string {
    return `
      <div id="produtos-form-card" class="card mb-3 d-none">
        <div class="card-body">
          <h3 id="produtos-form-titulo" class="h6 mb-3"></h3>
          <form id="produtos-form" class="row g-3" novalidate>
            <div class="col-md-6">
              <label for="produtos-nome" class="form-label">Nome</label>
              <input id="produtos-nome" class="form-control" maxlength="120">
            </div>
            <div class="col-md-3">
              <label for="produtos-categoria" class="form-label">Categoria</label>
              <select id="produtos-categoria" class="form-select"></select>
            </div>
            <div class="col-md-3">
              <label for="produtos-especie" class="form-label">Espécie</label>
              <select id="produtos-especie" class="form-select"></select>
            </div>
            <div class="col-md-6">
              <label for="produtos-descricao" class="form-label">Descrição <span class="text-secondary">(opcional)</span></label>
              <input id="produtos-descricao" class="form-control">
            </div>
            <div class="col-md-6">
              <label for="produtos-fornecedor" class="form-label">Fornecedor <span class="text-secondary">(opcional)</span></label>
              <select id="produtos-fornecedor" class="form-select"></select>
            </div>

            <div class="col-12"><hr class="my-1"></div>

            <div class="col-md-2">
              <label for="produtos-moeda" class="form-label">Moeda do custo</label>
              <select id="produtos-moeda" class="form-select">
                <option value="BRL">R$ (real)</option>
                <option value="USD">US$ (dólar)</option>
              </select>
            </div>
            <div class="col-md-2">
              <label for="produtos-custo" class="form-label">Custo</label>
              <input id="produtos-custo" class="form-control" inputmode="decimal" placeholder="0,00">
            </div>
            <div class="col-md-2">
              <label for="produtos-margem" class="form-label">Margem (%)</label>
              <input id="produtos-margem" class="form-control" inputmode="decimal" placeholder="30">
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button type="button" id="produtos-calcular" class="btn btn-outline-primary w-100">Calcular preço</button>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <div id="produtos-sugestao" class="small w-100"></div>
            </div>

            <div class="col-md-3">
              <label for="produtos-preco" class="form-label">Preço de venda (R$)</label>
              <input id="produtos-preco" class="form-control" inputmode="decimal" placeholder="0,00">
            </div>
            <div class="col-md-3">
              <label for="produtos-estoque" class="form-label">Estoque inicial</label>
              <input id="produtos-estoque" class="form-control" inputmode="numeric" placeholder="0">
              <div id="produtos-estoque-ajuda" class="form-text d-none">
                Na edição o estoque não muda aqui: ele muda pelos pedidos.
              </div>
            </div>
            <div class="col-md-3">
              <label for="produtos-minimo" class="form-label">Estoque mínimo</label>
              <input id="produtos-minimo" class="form-control" inputmode="numeric" placeholder="0">
            </div>

            <div class="col-12">
              <button type="submit" id="produtos-salvar" class="btn btn-success">Salvar</button>
              <button type="button" id="produtos-cancelar" class="btn btn-outline-secondary ms-2">Cancelar</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  /** Liga os botões (uma vez só). Só existe para o ADMIN. */
  private ligarEventos(): void {
    this.el('produtos-novo').addEventListener('click', () => this.abrirFormulario());
    this.el('produtos-cancelar').addEventListener('click', () => this.fecharFormulario());
    this.el('produtos-calcular').addEventListener('click', () => void this.calcularPreco());
    this.el('produtos-form').addEventListener('submit', (evento) => {
      evento.preventDefault();
      void this.salvar();
    });
    // Botões da lista + o botão "Usar este preço" (que nasce depois)
    this.app.addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (!botao) return;
      if (botao.dataset.acao === 'usar-sugestao') this.usarSugestao();
      else void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });
    // Mudou custo, moeda ou margem? A sugestão antiga não vale mais.
    for (const id of ['produtos-moeda', 'produtos-custo', 'produtos-margem']) {
      this.el(id).addEventListener('input', () => this.limparSugestao());
    }
  }

  // -------------------------------------------------------------------
  // Carregar dados
  // -------------------------------------------------------------------

  /** Busca os nomes de espécies, categorias e (só ADMIN) fornecedores. */
  private async carregarDicionarios(): Promise<void> {
    const [especies, categorias, fornecedores] = await Promise.all([
      window.api.chamar<Especie[]>('especies:listar'),
      window.api.chamar<Categoria[]>('categorias:listar'),
      // O ATENDENTE não pode listar fornecedores: nem pergunta.
      this.ehAdmin ? window.api.chamar<Fornecedor[]>('fornecedores:listar') : null,
    ]);

    if (especies.ok) this.especies = new Map(especies.dados.map((e) => [e.id, e.nome]));
    if (categorias.ok) this.categorias = new Map(categorias.dados.map((c) => [c.id, c.nome]));
    if (fornecedores?.ok) {
      this.fornecedores = new Map(
        fornecedores.dados.map((f) => [f.id, f.nome_fantasia ?? f.razao_social]),
      );
    }
    if (this.ehAdmin) this.preencherSelects();
  }

  /** Coloca as opções nas listas de escolha do formulário. */
  private preencherSelects(): void {
    const opcoes = (mapa: Map<number, string>, primeira: string): string =>
      `<option value="">${primeira}</option>` +
      [...mapa]
        .map(([id, nome]) => `<option value="${id}">${escapar(nome)}</option>`)
        .join('');

    this.el('produtos-categoria').innerHTML = opcoes(this.categorias, 'Escolha...');
    this.el('produtos-especie').innerHTML = opcoes(this.especies, 'Escolha...');
    this.el('produtos-fornecedor').innerHTML = opcoes(this.fornecedores, 'Nenhum');
  }

  /** Busca os produtos no Main e desenha a tabela. */
  private async carregar(): Promise<void> {
    const resposta = await window.api.chamar<ProdutoNaTela[]>('produtos:listar');
    const lista = this.el('produtos-lista');

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    this.produtos = resposta.dados;
    if (this.produtos.length === 0) {
      lista.innerHTML = '<tr><td colspan="7" class="text-secondary">Nenhum produto cadastrado.</td></tr>';
      return;
    }
    lista.innerHTML = this.produtos.map((p) => this.linha(p)).join('');
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** O HTML de uma linha. Todo texto do banco passa pelo escapar(). */
  private linha(p: ProdutoNaTela): string {
    const detalhe = `${this.categorias.get(p.categoria_id) ?? '?'} · ${this.especies.get(p.especie_id) ?? '?'}`;
    const produto = `${escapar(p.nome)}<div class="small text-secondary">${escapar(detalhe)}</div>`;
    const preco = `<td class="text-end text-nowrap">${REAL.format(p.preco_venda)}</td>`;

    // Estoque abaixo do mínimo: selo vermelho (mesma regra da tela inicial)
    const baixo = p.quantidade_estoque < p.estoque_minimo;
    const estoque = baixo
      ? `<td class="text-end"><span class="badge text-bg-danger" title="Abaixo do mínimo (${p.estoque_minimo})">${p.quantidade_estoque}</span></td>`
      : `<td class="text-end">${p.quantidade_estoque}</td>`;

    if (!this.ehAdmin) {
      return `<tr><td>${produto}</td>${preco}${estoque}</tr>`;
    }

    const fornecedor = p.fornecedor_id === null ? '-' : this.fornecedores.get(p.fornecedor_id) ?? '?';
    const moeda = p.moeda_custo === 'USD' ? DOLAR : REAL;
    return `
      <tr>
        <td>${produto}</td>
        <td>${escapar(fornecedor)}</td>
        <td class="text-end text-nowrap">${p.custo === undefined ? '-' : moeda.format(p.custo)}</td>
        <td class="text-end">${p.margem_percentual ?? '-'}%</td>
        ${preco}
        ${estoque}
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${p.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${p.id}">Excluir</button>
        </td>
      </tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(acao: string, id: number): Promise<void> {
    const produto = this.produtos.find((p) => p.id === id);
    if (!produto) return;

    if (acao === 'editar') this.abrirFormulario(produto);
    if (acao === 'excluir') {
      const certeza = await confirmar(
        'Excluir produto',
        `Excluir "${produto.nome}"? Esta ação não pode ser desfeita.`,
        'Excluir',
      );
      if (!certeza) return;

      const resposta = await window.api.chamar<void>('produtos:excluir', id);
      if (!resposta.ok) {
        // Ex.: "Este registro está em uso..." (o produto está num pedido)
        this.alerta('danger', resposta.erro);
        return;
      }
      if (this.idEmEdicao === id) this.fecharFormulario();
      await this.carregar();
      this.alerta('success', `Produto "${produto.nome}" excluído.`);
    }
  }

  // -------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------

  /** Mostra o formulário: vazio (novo) ou preenchido (editar). */
  private abrirFormulario(p?: ProdutoNaTela): void {
    this.idEmEdicao = p?.id ?? null;
    this.el('produtos-form-titulo').textContent = p ? `Editar: ${p.nome}` : 'Novo produto';

    this.input('produtos-nome').value = p?.nome ?? '';
    this.input('produtos-descricao').value = p?.descricao ?? '';
    this.select('produtos-categoria').value = p ? String(p.categoria_id) : '';
    this.select('produtos-especie').value = p ? String(p.especie_id) : '';
    this.select('produtos-fornecedor').value = p?.fornecedor_id ? String(p.fornecedor_id) : '';
    this.select('produtos-moeda').value = p?.moeda_custo ?? 'BRL';
    this.input('produtos-custo').value = p?.custo !== undefined ? this.numero(p.custo) : '';
    this.input('produtos-margem').value = p?.margem_percentual !== undefined ? this.numero(p.margem_percentual) : '30';
    this.input('produtos-preco').value = p ? this.numero(p.preco_venda) : '';
    this.input('produtos-minimo').value = p ? String(p.estoque_minimo) : '';

    // Estoque: no cadastro é o estoque inicial; na edição só aparece
    // (desligado), porque quem muda o estoque são os pedidos.
    this.input('produtos-estoque').value = p ? String(p.quantidade_estoque) : '';
    this.input('produtos-estoque').disabled = p !== undefined;
    this.el('produtos-estoque-ajuda').classList.toggle('d-none', p === undefined);

    this.limparSugestao();
    this.el('produtos-form-card').classList.remove('d-none');
    this.input('produtos-nome').focus();
  }

  private fecharFormulario(): void {
    this.idEmEdicao = null;
    this.el('produtos-form-card').classList.add('d-none');
  }

  /** Botão "Calcular preço": pede a sugestão ao Main (não salva nada). */
  private async calcularPreco(): Promise<void> {
    const botao = this.el('produtos-calcular') as HTMLButtonElement;
    botao.disabled = true;
    botao.textContent = 'Calculando...';
    const resposta = await window.api.chamar<Sugestao>('produtos:cotacao', {
      moeda_custo: this.select('produtos-moeda').value as MoedaCusto,
      custo: this.input('produtos-custo').value,
      margem_percentual: this.input('produtos-margem').value,
    });
    botao.disabled = false;
    botao.textContent = 'Calcular preço';

    if (!resposta.ok) {
      this.alerta('danger', resposta.erro);
      return;
    }

    const s = resposta.dados;
    this.sugerido = s.preco_sugerido;
    const cotacao = s.cotacao === null ? '' : `Dólar hoje: ${COTACAO.format(s.cotacao)} · `;
    // Montado com textContent + um botão criado à parte: nada vira HTML
    const caixa = this.el('produtos-sugestao');
    caixa.className = 'small w-100 alert alert-info py-2 mb-0';
    caixa.textContent = `${cotacao}Custo em reais: ${REAL.format(s.custo_em_reais)} · Sugerido: ${REAL.format(s.preco_sugerido)} `;
    const usar = document.createElement('button');
    usar.type = 'button';
    usar.className = 'btn btn-sm btn-primary ms-1';
    usar.dataset.acao = 'usar-sugestao';
    usar.textContent = 'Usar este preço';
    caixa.append(usar);
  }

  /** Copia o preço sugerido para o campo (o ADMIN ainda precisa salvar). */
  private usarSugestao(): void {
    if (this.sugerido === null) return;
    this.input('produtos-preco').value = this.numero(this.sugerido);
    this.input('produtos-preco').focus();
  }

  private limparSugestao(): void {
    this.sugerido = null;
    const caixa = this.el('produtos-sugestao');
    caixa.className = 'small w-100';
    caixa.replaceChildren();
  }

  /** Envia para o Main. Sem id = cadastrar; com id = editar. */
  private async salvar(): Promise<void> {
    const novo = this.idEmEdicao === null;
    // Os valores vão como o usuário digitou ("10,50", "3"...): quem
    // confere e converte é o ProdutoService, no Main.
    const dados = {
      ...(novo ? {} : { id: this.idEmEdicao }),
      nome: this.input('produtos-nome').value,
      descricao: this.input('produtos-descricao').value,
      categoria_id: this.select('produtos-categoria').value,
      especie_id: this.select('produtos-especie').value,
      fornecedor_id: this.select('produtos-fornecedor').value,
      moeda_custo: this.select('produtos-moeda').value,
      custo: this.input('produtos-custo').value,
      margem_percentual: this.input('produtos-margem').value,
      preco_venda: this.input('produtos-preco').value,
      ...(novo ? { quantidade_estoque: this.input('produtos-estoque').value } : {}),
      estoque_minimo: this.input('produtos-minimo').value,
    };

    const botao = this.el('produtos-salvar') as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar<number>('produtos:salvar', dados);
    botao.disabled = false;

    if (!resposta.ok) {
      this.alerta('danger', resposta.erro);
      return;
    }
    this.fecharFormulario();
    await this.carregar();
    this.alerta('success', novo ? 'Produto cadastrado.' : 'Produto atualizado.');
  }

  // -------------------------------------------------------------------
  // Atalhos
  // -------------------------------------------------------------------

  /** 10.5 -> "10,50" (para colocar num campo do formulário). */
  private numero(valor: number): string {
    return valor.toFixed(2).replace('.', ',');
  }

  private el(id: string): HTMLElement {
    return this.app.querySelector(`#${id}`) as HTMLElement;
  }

  private input(id: string): HTMLInputElement {
    return this.el(id) as HTMLInputElement;
  }

  private select(id: string): HTMLSelectElement {
    return this.el(id) as HTMLSelectElement;
  }

  private alerta(tipo: TipoAlerta, mensagem: string): void {
    mostrarAlerta(this.el('produtos-alerta'), tipo, mensagem);
  }
}
