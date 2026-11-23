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
// A distância NÃO é digitada: o Main calcula ao salvar (Nominatim +
// OSRM). Se o serviço de mapas falhar, o cliente é salvo mesmo assim,
// sem distância, e a tela mostra o aviso amarelo que o Main mandar.
//
// Canais usados (todos do Integrante 2, menos o auth:atual do Caio):
//   clientes:listar, clientes:salvar, clientes:excluir (só ADMIN),
//   clientes:buscarCep e auth:atual (para saber quem está logado).
//
// Mesmo padrão das outras telas (UsuariosPage, FornecedoresPage):
//   - nada de onclick="..." no HTML: os botões são ligados pelo código
//     (addEventListener), porque a Content-Security-Policy bloqueia
//     código escrito dentro do HTML;
//   - todo texto que vem de dados passa pelo escapar() antes de entrar
//     no HTML, para um nome como "<script>" aparecer como texto;
//   - ids sempre começando com "clientes-", para não bater com os ids
//     de outra tela;
//   - a validação de verdade é no Main (ClienteService): a tela pode
//     ser burlada pelo DevTools.
//
// Autor: Integrante 2 (clientes e entregadores)
// =====================================================================

import type { Cliente, Perfil, UsuarioSemSenha } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

// ---------------------------------------------------------------------
// Os formatos que o Main devolve para ESTA tela (mesmo jeito da
// FornecedoresPage: a tela descreve o que recebe, sem importar nada
// do processo Main).
// ---------------------------------------------------------------------

/** O que o "Buscar CEP" devolve (clientes:buscarCep). */
type EnderecoDoCep = Pick<Cliente, 'cep' | 'logradouro' | 'bairro' | 'cidade' | 'uf'>;

/** O que o "Salvar" devolve (clientes:salvar). aviso = null se deu tudo certo. */
interface ClienteSalvo {
  id: number;
  aviso: string | null;
}

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
  private perfil: Perfil | null = null; // quem está logado (para o botão Excluir)

  /** Desenha a página dentro do <main id="app"> (contrato do Integrante 1). */
  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    app.innerHTML = `
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
    this.el('clientes-buscar-cep').addEventListener('click', () => void this.buscarCep());
    this.el('clientes-form').addEventListener('submit', (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página
      void this.salvar();
    });
    // Um único "ouvinte" na lista inteira (delegação de eventos): o clique
    // em qualquer botão "sobe" até o <tbody>, e lá lemos data-acao e
    // data-id para saber QUAL botão de QUAL cliente foi clicado.
    this.el('clientes-lista').addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });

    // Quem está logado? Só o ADMIN vê o botão Excluir. (Esconder é só
    // conforto: quem impede de verdade é o IpcRouter, no Main.)
    const atual = await window.api.chamar<UsuarioSemSenha>('auth:atual');
    if (atual.ok) this.perfil = atual.dados.perfil;

    await this.carregar();
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Busca os clientes no Main e desenha a tabela. */
  private async carregar(): Promise<void> {
    const resposta = await window.api.chamar<Cliente[]>('clientes:listar');
    const lista = this.el('clientes-lista');

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    this.clientes = resposta.dados;
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

    // Excluir: só aparece para o ADMIN (tabela de permissões do README)
    const botaoExcluir =
      this.perfil === 'ADMIN'
        ? `<button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${c.id}">Excluir</button>`
        : '';

    return `
      <tr>
        <td>${escapar(c.nome)}</td>
        <td class="text-nowrap">${escapar(c.telefone)}</td>
        <td>${endereco}</td>
        <td class="text-nowrap">${escapar(c.cidade)} - ${escapar(c.uf)}</td>
        <td class="text-end text-nowrap">${distancia}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${c.id}">Editar</button>
          ${botaoExcluir}
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

      const resposta = await window.api.chamar<void>('clientes:excluir', id);
      if (!resposta.ok) {
        // Ex.: "Cliente tem pedidos e não pode ser excluído."
        this.alerta('danger', resposta.erro);
        return;
      }
      if (this.idEmEdicao === id) this.fecharFormulario();
      await this.carregar();
      this.alerta('success', `Cliente "${cliente.nome}" excluído.`);
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

  /** Botão "Buscar CEP": pede o endereço ao Main e preenche os campos. */
  private async buscarCep(): Promise<void> {
    const botao = this.el('clientes-buscar-cep') as HTMLButtonElement;
    botao.disabled = true; // evita clicar duas vezes enquanto espera
    botao.textContent = 'Buscando...';
    const resposta = await window.api.chamar<EnderecoDoCep>(
      'clientes:buscarCep',
      this.input('clientes-cep').value,
    );
    botao.disabled = false;
    botao.textContent = 'Buscar CEP';

    if (!resposta.ok) {
      // Ex.: "CEP não encontrado." ou "CEP inválido. Ele deve ter 8 números."
      this.alerta('danger', resposta.erro);
      return;
    }

    const endereco = resposta.dados;
    this.input('clientes-cep').value = this.formatarCep(endereco.cep);
    this.input('clientes-logradouro').value = endereco.logradouro;
    this.input('clientes-bairro').value = endereco.bairro;
    this.input('clientes-cidade').value = endereco.cidade;
    this.input('clientes-uf').value = endereco.uf;

    // Cidade com CEP único: o ViaCEP não sabe a rua nem o bairro
    if (endereco.logradouro === '') {
      this.alerta('info', 'Este CEP é da cidade inteira: preencha a rua e o bairro.');
      this.input('clientes-logradouro').focus();
      return;
    }
    this.alerta('info', 'Endereço preenchido pelo CEP. Confira e digite o número.');
    this.input('clientes-numero').focus();
  }

  /** Botão "Salvar". Sem id = cadastrar; com id = editar. */
  private async salvar(): Promise<void> {
    // A distância NÃO vai: quem calcula é o Main.
    const dados = {
      ...(this.idEmEdicao === null ? {} : { id: this.idEmEdicao }),
      nome: this.input('clientes-nome').value,
      telefone: this.input('clientes-telefone').value,
      cep: this.input('clientes-cep').value,
      logradouro: this.input('clientes-logradouro').value,
      numero: this.input('clientes-numero').value,
      complemento: this.input('clientes-complemento').value,
      bairro: this.input('clientes-bairro').value,
      cidade: this.input('clientes-cidade').value,
      uf: this.input('clientes-uf').value,
    };

    // Desliga o botão enquanto espera: evita salvar duas vezes. Pode
    // levar alguns segundos, porque o Main consulta o mapa.
    const botao = this.el('clientes-salvar') as HTMLButtonElement;
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    const resposta = await window.api.chamar<ClienteSalvo>('clientes:salvar', dados);
    botao.disabled = false;
    botao.textContent = 'Salvar';

    if (!resposta.ok) {
      // Ex.: "O campo Nome é obrigatório." (o formulário continua aberto)
      this.alerta('danger', resposta.erro);
      return;
    }

    const editou = this.idEmEdicao !== null;
    this.fecharFormulario();
    await this.carregar();
    if (resposta.dados.aviso !== null) {
      // Salvou, mas sem distância: aviso amarelo com o motivo
      this.alerta('warning', resposta.dados.aviso);
    } else {
      this.alerta('success', editou ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    }
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
