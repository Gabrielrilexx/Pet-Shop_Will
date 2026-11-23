// =====================================================================
// ClientesPage.ts — o "FICHÁRIO DE CLIENTES" da loja
// ---------------------------------------------------------------------
// Pense na caixa de fichas que fica no balcão: cada ficha tem o nome,
// o telefone e o endereço de quem compra pelo WhatsApp. A tela tem
// duas partes:
//   1. o FORMULÁRIO (escondido até clicar em "Novo cliente" ou em
//      "Editar"), com o botão "Buscar CEP": digita o CEP, clica, e a
//      rua, o bairro, a cidade e a UF se preenchem sozinhos;
//   2. a LISTA, com a distância da loja até a casa de cada cliente e
//      os botões Editar e Excluir.
//
// ESTADO ATUAL (PROVISÓRIO — Passo 2 do Integrante 2): só o LAYOUT.
// A tela ainda NÃO conversa com o Main: mostra os clientes de exemplo
// do database/exemplo.sql e uma faixa amarela avisando isso. Cada
// trecho marcado com "TROCAR NO PASSO 5" vira uma chamada
// window.api.chamar(...) quando o ClienteService existir.
//
// Mesmo padrão das outras telas (UsuariosPage, FornecedoresPage):
//   - nada de onclick="..." no HTML: os botões são ligados pelo código
//     (addEventListener), porque a Content-Security-Policy bloqueia
//     código escrito dentro do HTML;
//   - todo texto que vem de dados passa pelo escapar() antes de entrar
//     no HTML, para um nome como "<script>" aparecer como texto;
//   - ids sempre começando com "clientes-", para não bater com os ids
//     de outra tela.
//
// Autor: Integrante 2 (clientes e entregadores)
// =====================================================================

import type { Cliente } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

// =====================================================================
// DADOS PROVISÓRIOS — TROCAR NO PASSO 5
// Copiados do database/exemplo.sql só para enxergar a tela. Os ids aqui
// são de mentira: no banco de verdade podem ser outros números.
// A "Diego Rocha" está SEM distância (null), como quando a API de mapas
// falha: serve para ver como a tela mostra esse caso.
// =====================================================================
const CLIENTES_PROVISORIOS: Cliente[] = [
  {
    id: 1, nome: 'Ana Souza', telefone: '(19) 90000-0001', cep: '13480001',
    logradouro: 'Rua Senador Vergueiro', numero: '120', complemento: null,
    bairro: 'Centro', cidade: 'Limeira', uf: 'SP',
    latitude: null, longitude: null, distancia_km: 2.1,
  },
  {
    id: 2, nome: 'Bruno Lima', telefone: '(19) 90000-0002', cep: '13480010',
    logradouro: 'Rua Carlos Gomes', numero: '455', complemento: 'Apto 12',
    bairro: 'Centro', cidade: 'Limeira', uf: 'SP',
    latitude: null, longitude: null, distancia_km: 1.4,
  },
  {
    id: 3, nome: 'Carla Mendes', telefone: '(19) 90000-0003', cep: '13480210',
    logradouro: 'Rua Barão de Campinas', numero: '300', complemento: null,
    bairro: 'Centro', cidade: 'Limeira', uf: 'SP',
    latitude: null, longitude: null, distancia_km: 2.8,
  },
  {
    id: 4, nome: 'Diego Rocha', telefone: '(19) 90000-0004', cep: '13480040',
    logradouro: 'Rua Santa Cruz', numero: '88', complemento: 'Casa 2',
    bairro: 'Centro', cidade: 'Limeira', uf: 'SP',
    latitude: null, longitude: null, distancia_km: null,
  },
];
// ======================== fim dos dados provisórios ===================

/** Distância do jeito brasileiro: 2.1 -> "2,10 km". */
const quilometros = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export class ClientesPage {
  // "!" = "prometo que vou preencher antes de usar" (é preenchido no render).
  private app!: HTMLElement;
  private clientes: Cliente[] = [];
  private idEmEdicao: number | null = null; // null = cadastrando um novo

  /** Desenha a página dentro do <main id="app"> (contrato do Integrante 1). */
  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    app.innerHTML = `
      <div class="alert alert-warning py-2 small">
        <strong>Dados de exemplo (provisório).</strong>
        Esta tela ainda não está ligada ao sistema: nada é salvo no banco.
      </div>

      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Clientes</h2>
        <button type="button" id="clientes-novo" class="btn btn-primary">Novo cliente</button>
      </div>
      <div id="clientes-alerta"></div>

      <!-- ============ FORMULÁRIO (começa escondido: d-none) ============ -->
      <div id="clientes-form-card" class="card mb-3 d-none">
        <div class="card-body">
          <h3 id="clientes-form-titulo" class="h6 mb-3"></h3>
          <form id="clientes-form" class="row g-3" novalidate>
            <div class="col-md-6">
              <label for="clientes-nome" class="form-label">Nome</label>
              <input id="clientes-nome" class="form-control" maxlength="100">
            </div>
            <div class="col-md-3">
              <label for="clientes-telefone" class="form-label">Telefone (WhatsApp)</label>
              <input id="clientes-telefone" class="form-control" maxlength="20"
                     placeholder="(19) 90000-0000" inputmode="tel">
            </div>
            <div class="col-md-3">
              <label for="clientes-cep" class="form-label">CEP</label>
              <div class="input-group">
                <input id="clientes-cep" class="form-control" maxlength="9"
                       placeholder="00000-000" inputmode="numeric">
                <button type="button" id="clientes-buscar-cep" class="btn btn-outline-primary">Buscar CEP</button>
              </div>
            </div>
            <div class="col-md-6">
              <label for="clientes-logradouro" class="form-label">Rua</label>
              <input id="clientes-logradouro" class="form-control" maxlength="150">
            </div>
            <div class="col-md-2">
              <label for="clientes-numero" class="form-label">Número</label>
              <input id="clientes-numero" class="form-control" maxlength="10" placeholder="120 ou S/N">
            </div>
            <div class="col-md-4">
              <label for="clientes-complemento" class="form-label">Complemento</label>
              <input id="clientes-complemento" class="form-control" maxlength="60"
                     placeholder="Apto, bloco, casa... (opcional)">
            </div>
            <div class="col-md-5">
              <label for="clientes-bairro" class="form-label">Bairro</label>
              <input id="clientes-bairro" class="form-control" maxlength="80">
            </div>
            <div class="col-md-5">
              <label for="clientes-cidade" class="form-label">Cidade</label>
              <input id="clientes-cidade" class="form-control" maxlength="80">
            </div>
            <div class="col-md-2">
              <label for="clientes-uf" class="form-label">UF</label>
              <input id="clientes-uf" class="form-control text-uppercase" maxlength="2">
            </div>
            <div class="col-12 form-text mt-1">
              A distância até a loja é calculada sozinha ao salvar, pelo endereço.
            </div>
            <div class="col-12">
              <button type="submit" id="clientes-salvar" class="btn btn-success">Salvar</button>
              <button type="button" id="clientes-cancelar" class="btn btn-outline-secondary ms-2">Cancelar</button>
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
            <th>Telefone</th>
            <th>Endereço</th>
            <th>Cidade</th>
            <th class="text-end">Distância</th>
            <th class="text-end">Ações</th>
          </tr>
        </thead>
        <tbody id="clientes-lista">
          <tr><td colspan="6" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>
      </div>`;

    // Ligações dos botões (uma vez só, ao abrir a tela)
    this.el('clientes-novo').addEventListener('click', () => this.abrirFormulario());
    this.el('clientes-cancelar').addEventListener('click', () => this.fecharFormulario());
    this.el('clientes-buscar-cep').addEventListener('click', () => this.buscarCep());
    this.el('clientes-form').addEventListener('submit', (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página
      this.salvar();
    });
    // Um único "ouvinte" na lista inteira (delegação de eventos): o clique
    // em qualquer botão "sobe" até o <tbody>, e lá lemos data-acao e
    // data-id para saber QUAL botão de QUAL cliente foi clicado.
    this.el('clientes-lista').addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });

    this.carregar();
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Pega os clientes e desenha a tabela. */
  private carregar(): void {
    // TROCAR NO PASSO 5: const resposta = await window.api.chamar<Cliente[]>('clientes:listar');
    // (e, se resposta.ok for false, mostrar resposta.erro no alerta)
    this.clientes = [...CLIENTES_PROVISORIOS]; // cópia, para não estragar o original

    const lista = this.el('clientes-lista');
    if (this.clientes.length === 0) {
      lista.innerHTML =
        '<tr><td colspan="6" class="text-secondary">Nenhum cliente cadastrado.</td></tr>';
      return;
    }
    lista.innerHTML = this.clientes.map((c) => this.linha(c)).join('');
  }

  /** O HTML de uma linha. Todo texto do banco passa pelo escapar(). */
  private linha(c: Cliente): string {
    // Endereço em duas linhas: "Rua X, 120 - Apto 12" e, menor, o bairro.
    const complemento = c.complemento ? ` - ${escapar(c.complemento)}` : '';
    const endereco =
      `${escapar(c.logradouro)}, ${escapar(c.numero)}${complemento}` +
      `<div class="small text-secondary">${escapar(c.bairro)} · CEP ${escapar(this.formatarCep(c.cep))}</div>`;

    // Sem distância (a API falhou): aviso amarelo, NUNCA um número inventado,
    // porque distância errada vira taxa de entrega errada no pedido.
    const distancia =
      c.distancia_km === null
        ? '<span class="badge text-bg-warning">sem distância</span>'
        : `${quilometros.format(c.distancia_km)} km`;

    return `
      <tr>
        <td>${escapar(c.nome)}</td>
        <td class="text-nowrap">${escapar(c.telefone)}</td>
        <td>${endereco}</td>
        <td class="text-nowrap">${escapar(c.cidade)} - ${escapar(c.uf)}</td>
        <td class="text-end text-nowrap">${distancia}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${c.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${c.id}">Excluir</button>
        </td>
      </tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(acao: string, id: number): Promise<void> {
    const cliente = this.clientes.find((c) => c.id === id);
    if (!cliente) return;

    if (acao === 'editar') this.abrirFormulario(cliente);
    if (acao === 'excluir') {
      const certeza = await confirmar(
        'Excluir cliente',
        `Excluir "${cliente.nome}"? Esta ação não pode ser desfeita.`,
        'Excluir',
      );
      if (!certeza) return;

      // TROCAR NO PASSO 5: window.api.chamar<void>('clientes:excluir', id),
      // mostrar resposta.erro se der errado (ex.: "Cliente tem pedidos e
      // não pode ser excluído.") e recarregar a lista se der certo.
      this.alerta('warning', 'Tela provisória: a exclusão ainda não está ligada ao banco.');
    }
  }

  // -------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------

  /** Mostra o formulário: vazio (novo) ou preenchido (editar). */
  private abrirFormulario(cliente?: Cliente): void {
    this.idEmEdicao = cliente?.id ?? null;
    this.el('clientes-form-titulo').textContent = cliente
      ? `Editar: ${cliente.nome}`
      : 'Novo cliente';

    // "?? ''" = se não tiver cliente (cadastro novo), o campo fica vazio
    this.input('clientes-nome').value = cliente?.nome ?? '';
    this.input('clientes-telefone').value = cliente?.telefone ?? '';
    this.input('clientes-cep').value = cliente ? this.formatarCep(cliente.cep) : '';
    this.input('clientes-logradouro').value = cliente?.logradouro ?? '';
    this.input('clientes-numero').value = cliente?.numero ?? '';
    this.input('clientes-complemento').value = cliente?.complemento ?? '';
    this.input('clientes-bairro').value = cliente?.bairro ?? '';
    this.input('clientes-cidade').value = cliente?.cidade ?? '';
    this.input('clientes-uf').value = cliente?.uf ?? '';

    this.el('clientes-form-card').classList.remove('d-none');
    this.input('clientes-nome').focus();
  }

  private fecharFormulario(): void {
    this.idEmEdicao = null;
    this.el('clientes-form-card').classList.add('d-none');
  }

  /** Botão "Buscar CEP". */
  private buscarCep(): void {
    // TROCAR NO PASSO 5: window.api.chamar('clientes:buscarCep', cep) e
    // preencher rua, bairro, cidade e UF com a resposta do ViaCEP.
    this.alerta('info', 'Tela provisória: a busca pelo CEP ainda não está ligada ao sistema.');
  }

  /** Botão "Salvar". Sem id = cadastrar; com id = editar. */
  private salvar(): void {
    // TROCAR NO PASSO 5: montar o objeto com os campos do formulário
    // (com o id quando estiver editando) e enviar com
    // window.api.chamar<number>('clientes:salvar', dados).
    this.alerta('warning', 'Tela provisória: o cadastro ainda não é salvo no banco.');
  }

  // -------------------------------------------------------------------
  // Atalhos
  // -------------------------------------------------------------------

  /** "13480001" -> "13480-001" (só para mostrar; no banco fica sem traço). */
  private formatarCep(cep: string): string {
    const d = String(cep ?? '').replace(/\D/g, '');
    if (d.length !== 8) return cep;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  }

  private el(id: string): HTMLElement {
    return this.app.querySelector(`#${id}`) as HTMLElement;
  }

  private input(id: string): HTMLInputElement {
    return this.el(id) as HTMLInputElement;
  }

  private alerta(tipo: TipoAlerta, mensagem: string): void {
    mostrarAlerta(this.el('clientes-alerta'), tipo, mensagem);
  }
}
