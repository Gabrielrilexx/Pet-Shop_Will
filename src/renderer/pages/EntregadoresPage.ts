// =====================================================================
// EntregadoresPage.ts — a "PASTA DO RH" com os motoboys (só ADMIN)
// ---------------------------------------------------------------------
// Pense na pasta onde o dono guarda a ficha de cada motoboy contratado.
// A tela tem duas partes:
//   1. o FORMULÁRIO (escondido até clicar em "Novo entregador" ou em
//      "Editar"): nome, CPF, telefone, placa da moto, valor por km e se
//      ele está ATIVO (pode sair com pedido) ou não;
//   2. a LISTA, com o CPF MASCARADO (***.456.789-**).
//
// LGPD (o CPF é dado sensível):
//   - a lista já chega do Main com o CPF mascarado: o CPF completo
//     NUNCA volta para a tela depois de salvo;
//   - por isso, ao EDITAR, o campo CPF vem vazio: deixar vazio = manter
//     o CPF atual; digitar = trocar (decisão do grupo: dúvida 3, opção a).
//
// Entregador que já fez entregas não pode ser excluído (o histórico
// precisa ficar): o Main avisa, e o caminho é DESATIVAR (desmarcar
// "Ativo"). Inativo não aparece na lista de saída do Integrante 4.
//
// Só o ADMIN vê esta tela (rotas.ts). Mesmo assim, quem impede de
// verdade é o IpcRouter: entregadores:salvar e :excluir são só ADMIN.
//
// Mesmo padrão das outras telas: nada de onclick="..." no HTML, todo
// texto do banco passa pelo escapar(), ids começando com "entregadores-".
//
// Autor: Integrante 2 (clientes e entregadores)
// =====================================================================

import type { Entregador } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

/** Dinheiro do jeito brasileiro: 2.5 -> "R$ 2,50". */
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export class EntregadoresPage {
  // "!" = "prometo que vou preencher antes de usar" (é preenchido no render).
  private app!: HTMLElement;
  // O cpf que chega aqui já vem MASCARADO pelo Main (ex.: ***.456.789-**)
  private entregadores: Entregador[] = [];
  private idEmEdicao: number | null = null; // null = cadastrando um novo

  /** Desenha a página dentro do <main id="app"> (contrato do Integrante 1). */
  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Entregadores</h2>
        <button type="button" id="entregadores-novo" class="btn btn-primary">Novo entregador</button>
      </div>
      <div id="entregadores-alerta"></div>

      <!-- ============ FORMULÁRIO (começa escondido: d-none) ============ -->
      <div id="entregadores-form-card" class="card mb-3 d-none">
        <div class="card-body">
          <h3 id="entregadores-form-titulo" class="h6 mb-3"></h3>
          <form id="entregadores-form" class="row g-3" novalidate>
            <div class="col-md-6">
              <label for="entregadores-nome" class="form-label">Nome</label>
              <input id="entregadores-nome" class="form-control" maxlength="100">
            </div>
            <div class="col-md-3">
              <label for="entregadores-cpf" class="form-label">CPF</label>
              <input id="entregadores-cpf" class="form-control" maxlength="14"
                     placeholder="000.000.000-00" inputmode="numeric" autocomplete="off">
              <div id="entregadores-cpf-dica" class="form-text"></div>
            </div>
            <div class="col-md-3">
              <label for="entregadores-telefone" class="form-label">Telefone</label>
              <input id="entregadores-telefone" class="form-control" maxlength="20"
                     placeholder="(19) 90000-0000" inputmode="tel">
            </div>
            <div class="col-md-3">
              <label for="entregadores-placa" class="form-label">Placa da moto</label>
              <input id="entregadores-placa" class="form-control text-uppercase" maxlength="8"
                     placeholder="ABC1D23">
            </div>
            <div class="col-md-3">
              <label for="entregadores-valor" class="form-label">Valor por km (R$)</label>
              <input id="entregadores-valor" class="form-control" maxlength="8"
                     placeholder="2,50" inputmode="decimal">
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <div class="form-check mb-2">
                <input id="entregadores-ativo" type="checkbox" class="form-check-input">
                <label for="entregadores-ativo" class="form-check-label">
                  Ativo (pode sair com pedidos)
                </label>
              </div>
            </div>
            <div class="col-12">
              <button type="submit" id="entregadores-salvar" class="btn btn-success">Salvar</button>
              <button type="button" id="entregadores-cancelar" class="btn btn-outline-secondary ms-2">Cancelar</button>
            </div>
          </form>
        </div>
      </div>

      <!-- ============ LISTA ============ -->
      <div class="table-responsive">
      <table class="table table-striped align-middle bg-white border">
        <thead>
          <tr>
            <th>Nome</th>
            <th>CPF</th>
            <th>Telefone</th>
            <th>Placa</th>
            <th class="text-end">Valor por km</th>
            <th>Situação</th>
            <th class="text-end">Ações</th>
          </tr>
        </thead>
        <tbody id="entregadores-lista">
          <tr><td colspan="7" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>
      </div>`;

    // Ligações dos botões (uma vez só, ao abrir a tela)
    this.el('entregadores-novo').addEventListener('click', () => this.abrirFormulario());
    this.el('entregadores-cancelar').addEventListener('click', () => this.fecharFormulario());
    this.el('entregadores-form').addEventListener('submit', (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página
      void this.salvar();
    });
    // Um único "ouvinte" na lista inteira (delegação de eventos)
    this.el('entregadores-lista').addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });

    await this.carregar();
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Busca os entregadores no Main e desenha a tabela. */
  private async carregar(): Promise<void> {
    const resposta = await window.api.chamar<Entregador[]>('entregadores:listar');
    const lista = this.el('entregadores-lista');

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    this.entregadores = resposta.dados;
    if (this.entregadores.length === 0) {
      lista.innerHTML =
        '<tr><td colspan="7" class="text-secondary">Nenhum entregador cadastrado.</td></tr>';
      return;
    }
    lista.innerHTML = this.entregadores.map((e) => this.linha(e)).join('');
  }

  /** O HTML de uma linha. Todo texto do banco passa pelo escapar(). */
  private linha(e: Entregador): string {
    const situacao = e.ativo
      ? '<span class="badge text-bg-success">Ativo</span>'
      : '<span class="badge text-bg-secondary">Inativo</span>';

    // O cpf já vem mascarado do Main (***.456.789-**)
    return `
      <tr>
        <td>${escapar(e.nome)}</td>
        <td class="text-nowrap font-monospace">${escapar(e.cpf)}</td>
        <td class="text-nowrap">${escapar(e.telefone)}</td>
        <td class="text-nowrap">${escapar(e.placa_moto)}</td>
        <td class="text-end text-nowrap">${escapar(reais.format(e.valor_por_km))}</td>
        <td>${situacao}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${e.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${e.id}">Excluir</button>
        </td>
      </tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(acao: string, id: number): Promise<void> {
    const entregador = this.entregadores.find((e) => e.id === id);
    if (!entregador) return;

    if (acao === 'editar') this.abrirFormulario(entregador);
    if (acao === 'excluir') {
      const certeza = await confirmar(
        'Excluir entregador',
        `Excluir "${entregador.nome}"? Esta ação não pode ser desfeita. ` +
          'Se ele só não vai mais trabalhar, prefira desativar.',
        'Excluir',
      );
      if (!certeza) return;

      const resposta = await window.api.chamar<void>('entregadores:excluir', id);
      if (!resposta.ok) {
        // Ex.: "Entregador tem entregas registradas e não pode ser excluído..."
        this.alerta('danger', resposta.erro);
        return;
      }
      if (this.idEmEdicao === id) this.fecharFormulario();
      await this.carregar();
      this.alerta('success', `Entregador "${entregador.nome}" excluído.`);
    }
  }

  // -------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------

  /** Mostra o formulário: vazio (novo) ou preenchido (editar). */
  private abrirFormulario(entregador?: Entregador): void {
    this.idEmEdicao = entregador?.id ?? null;
    this.el('entregadores-form-titulo').textContent = entregador
      ? `Editar: ${entregador.nome}`
      : 'Novo entregador';

    this.input('entregadores-nome').value = entregador?.nome ?? '';
    this.input('entregadores-telefone').value = entregador?.telefone ?? '';
    this.input('entregadores-placa').value = entregador?.placa_moto ?? '';
    // 2.5 -> "2,50" (do jeito que se digita no Brasil)
    this.input('entregadores-valor').value = entregador
      ? entregador.valor_por_km.toFixed(2).replace('.', ',')
      : '';
    // Cadastro novo já vem marcado como ativo
    this.input('entregadores-ativo').checked = entregador?.ativo ?? true;

    // CPF: SEMPRE vazio (o completo nunca volta para a tela).
    // Editando: vazio = manter o atual. Novo: obrigatório.
    this.input('entregadores-cpf').value = '';
    this.el('entregadores-cpf-dica').textContent = entregador
      ? `Atual: ${entregador.cpf}. Deixe em branco para manter.`
      : 'Obrigatório.';

    this.el('entregadores-form-card').classList.remove('d-none');
    this.input('entregadores-nome').focus();
  }

  private fecharFormulario(): void {
    this.idEmEdicao = null;
    this.input('entregadores-cpf').value = ''; // não deixa CPF esquecido na tela
    this.el('entregadores-form-card').classList.add('d-none');
  }

  /** Botão "Salvar". Sem id = cadastrar; com id = editar. */
  private async salvar(): Promise<void> {
    const dados = {
      ...(this.idEmEdicao === null ? {} : { id: this.idEmEdicao }),
      nome: this.input('entregadores-nome').value,
      cpf: this.input('entregadores-cpf').value, // vazio na edição = manter
      telefone: this.input('entregadores-telefone').value,
      placa_moto: this.input('entregadores-placa').value,
      valor_por_km: this.input('entregadores-valor').value, // o Main aceita "2,50"
      ativo: this.input('entregadores-ativo').checked, // sempre true ou false
    };

    // Desliga o botão enquanto espera: evita salvar duas vezes
    const botao = this.el('entregadores-salvar') as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar<number>('entregadores:salvar', dados);
    botao.disabled = false;

    if (!resposta.ok) {
      // Ex.: "CPF inválido." ou "Já existe um entregador com esse CPF."
      this.alerta('danger', resposta.erro);
      return;
    }
    const editou = this.idEmEdicao !== null;
    this.fecharFormulario();
    await this.carregar();
    this.alerta('success', editou ? 'Entregador atualizado.' : 'Entregador cadastrado.');
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

  private alerta(tipo: TipoAlerta, mensagem: string): void {
    mostrarAlerta(this.el('entregadores-alerta'), tipo, mensagem);
  }
}
