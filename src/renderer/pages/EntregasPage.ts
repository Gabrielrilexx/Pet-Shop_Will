// =====================================================================
// EntregasPage.ts — a "PORTA DA COZINHA": quem sai e quem está na rua
// ---------------------------------------------------------------------
// Uma tela só, com duas listas:
//   1. PRONTOS PARA SAIR: os pedidos CONFIRMADOS. Em cada um, o
//      atendente escolhe o motoboy (só os ATIVOS aparecem), vê uma
//      PRÉVIA da taxa e clica em "Sair para entrega".
//   2. NA RUA AGORA: as entregas EM_ROTA, com os botões "Entregue" e
//      "Não entregue" (este pede o motivo, obrigatório).
//
// Canais usados:
//   entregas:listarEmRota / sair / entregue / naoEntregue  (meus)
//   pedidos:listar (meu)   clientes:listar, entregadores:listar (Integrante 2)
//
// A taxa mostrada AQUI é só uma prévia: quem calcula de verdade é o
// Main (EntregaService), com os dados do banco. A tela nem manda a taxa.
//
// Regras da tela (README, Passo 6): sem onclick no HTML, escapar() em
// todo texto que vem de dados, mostrarAlerta() e confirmar() do ui.ts.
//
// Autor: Integrante 4 (pedidos e entregas)
// =====================================================================

import type { Cliente, Entrega, Entregador, Pedido } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';
import type { TipoAlerta } from '../ui';

// Os "recortes" que esta tela usa (o ATENDENTE recebe o entregador sem CPF).
type ClienteNaTela = Pick<Cliente, 'id' | 'nome' | 'distancia_km'>;
type EntregadorNaTela = Pick<Entregador, 'id' | 'nome' | 'valor_por_km' | 'ativo'>;
type PedidoNaLista = Pedido & { cliente_nome: string };
type EntregaNaRua = Entrega & { cliente_nome: string; entregador_nome: string };

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const km = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export class EntregasPage {
    private app!: HTMLElement;
    private prontos: PedidoNaLista[] = []; // pedidos CONFIRMADOS
    private naRua: EntregaNaRua[] = [];
    private ativos: EntregadorNaTela[] = [];
    private distancias = new Map<number, number | null>(); // cliente_id -> distancia_km
    private entregaDoMotivo: number | null = null; // a entrega do formulário "Não entregue"

    async render(app: HTMLElement): Promise<void> {
        this.app = app;
        app.innerHTML = `
      <h2 class="h4 mb-3">Entregas</h2>
      <div id="entregas-alerta"></div>

      <!-- Formulário do motivo (aparece ao clicar em "Não entregue") -->
      <div id="entregas-motivo-card" class="card border-warning mb-3 d-none">
        <div class="card-body">
          <h3 id="entregas-motivo-titulo" class="h6"></h3>
          <label for="entregas-motivo" class="form-label">Motivo (obrigatório)</label>
          <input id="entregas-motivo" class="form-control mb-2" maxlength="255"
                 placeholder="Ex.: cliente ausente, endereço errado">
          <div class="d-flex justify-content-end gap-2">
            <button type="button" id="entregas-motivo-fechar" class="btn btn-outline-secondary">Fechar</button>
            <button type="button" id="entregas-motivo-salvar" class="btn btn-warning">Registrar não entrega</button>
          </div>
        </div>
      </div>

      <h3 class="h5 mt-2">Prontos para sair</h3>
      <table class="table align-middle">
        <thead>
          <tr><th>Nº</th><th>Cliente</th><th class="text-end">Distância</th>
              <th class="text-end">Subtotal</th><th>Motoboy</th>
              <th class="text-end">Taxa (prévia)</th><th></th></tr>
        </thead>
        <tbody id="entregas-prontos">
          <tr><td colspan="7" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>

      <h3 class="h5 mt-4">Na rua agora</h3>
      <table class="table align-middle">
        <thead>
          <tr><th>Pedido</th><th>Cliente</th><th>Motoboy</th><th>Saiu em</th>
              <th class="text-end">Taxa</th><th></th></tr>
        </thead>
        <tbody id="entregas-rua">
          <tr><td colspan="6" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>`;

        this.ligarEventos();
        await this.carregar();
    }

    // ===================================================================
    // EVENTOS (delegação: um "ouvido" por tabela, NUNCA no #app inteiro)
    // ===================================================================

    private ligarEventos(): void {
        const prontos = this.el('entregas-prontos');
        // Trocou o motoboy de um pedido: atualiza a prévia da taxa daquela linha.
        prontos.addEventListener('change', (evento) => {
            const select = (evento.target as HTMLElement).closest<HTMLSelectElement>('select[data-pedido]');
            if (select) this.atualizarPrevia(Number(select.dataset.pedido));
        });
        prontos.addEventListener('click', (evento) => {
            const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao="sair"]');
            if (botao) void this.sair(Number(botao.dataset.id), botao);
        });

        this.el('entregas-rua').addEventListener('click', (evento) => {
            const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
            if (!botao) return;
            const id = Number(botao.dataset.id);
            if (botao.dataset.acao === 'entregue') void this.entregue(id);
            if (botao.dataset.acao === 'nao-entregue') this.abrirMotivo(id);
        });

        this.el('entregas-motivo-fechar').addEventListener('click', () => this.fecharMotivo());
        this.el('entregas-motivo-salvar').addEventListener('click', () => void this.naoEntregue());
    }

    // ===================================================================
    // CARREGAR TUDO
    // ===================================================================

    private async carregar(): Promise<void> {
        // As 4 perguntas vão juntas ao Main (Promise.all = "peça tudo de uma vez").
        const [pedidos, clientes, entregadores, rua] = await Promise.all([
            window.api.chamar<PedidoNaLista[]>('pedidos:listar'),
            window.api.chamar<ClienteNaTela[]>('clientes:listar'),
            window.api.chamar<EntregadorNaTela[]>('entregadores:listar'),
            window.api.chamar<EntregaNaRua[]>('entregas:listarEmRota'),
        ]);
        for (const r of [pedidos, clientes, entregadores, rua]) {
            if (!r.ok) {
                this.alerta('danger', r.erro);
                return;
            }
        }
        // (o "if" abaixo só existe para o TypeScript saber que todos deram ok)
        if (!pedidos.ok || !clientes.ok || !entregadores.ok || !rua.ok) return;

        this.prontos = pedidos.dados.filter((p) => p.status === 'CONFIRMADO');
        this.distancias = new Map(clientes.dados.map((c) => [c.id, c.distancia_km]));
        this.ativos = entregadores.dados.filter((e) => e.ativo); // inativo não sai com pedido
        this.naRua = rua.dados;

        this.desenharProntos();
        this.desenharRua();
    }

    // ===================================================================
    // LISTA 1: PRONTOS PARA SAIR
    // ===================================================================

    private desenharProntos(): void {
        const corpo = this.el('entregas-prontos');
        if (this.prontos.length === 0) {
            corpo.innerHTML = '<tr><td colspan="7" class="text-secondary">Nenhum pedido confirmado esperando saída.</td></tr>';
            return;
        }
        const opcoes = this.ativos
            .map((e) => `<option value="${e.id}">${escapar(e.nome)} (${reais.format(e.valor_por_km)}/km)</option>`)
            .join('');

        corpo.innerHTML = this.prontos
            .map((p) => {
                const distancia = this.distancias.get(p.cliente_id) ?? null;
                // Sem distância ou sem motoboy ativo: a linha aparece, mas não dá para despachar.
                const bloqueio =
                    distancia === null
                        ? 'Cliente sem distância: edite o endereço na tela de Clientes.'
                        : this.ativos.length === 0
                            ? 'Nenhum motoboy ativo.'
                            : '';
                const desliga = bloqueio ? 'disabled' : '';
                return `
        <tr>
          <td>${p.id}</td>
          <td>${escapar(p.cliente_nome)}</td>
          <td class="text-end">${distancia === null ? '<span class="badge text-bg-warning">sem distância</span>' : `${km.format(distancia)} km`}</td>
          <td class="text-end">${reais.format(p.subtotal)}</td>
          <td>
            <select class="form-select form-select-sm" data-pedido="${p.id}" ${desliga}>
              <option value="">Escolha...</option>${opcoes}
            </select>
            ${bloqueio ? `<div class="form-text text-danger">${escapar(bloqueio)}</div>` : ''}
          </td>
          <td class="text-end" id="entregas-previa-${p.id}">-</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-primary" data-acao="sair" data-id="${p.id}" ${desliga}>Sair para entrega</button>
          </td>
        </tr>`;
            })
            .join('');
    }

    /** Prévia da taxa: distância x valor por km (o Main recalcula na saída). */
    private atualizarPrevia(pedidoId: number): void {
        const pedido = this.prontos.find((p) => p.id === pedidoId);
        const entregador = this.ativos.find((e) => e.id === this.entregadorEscolhido(pedidoId));
        const distancia = pedido ? (this.distancias.get(pedido.cliente_id) ?? null) : null;
        const celula = this.el(`entregas-previa-${pedidoId}`);
        if (!pedido || !entregador || distancia === null) {
            celula.textContent = '-';
            return;
        }
        const taxa = Math.round(distancia * entregador.valor_por_km * 100) / 100;
        celula.textContent = `${reais.format(taxa)} (total ${reais.format(pedido.subtotal + taxa)})`;
    }

    private entregadorEscolhido(pedidoId: number): number {
        const select = this.app.querySelector<HTMLSelectElement>(`select[data-pedido="${pedidoId}"]`);
        return Number(select?.value ?? 0);
    }

    private async sair(pedidoId: number, botao: HTMLButtonElement): Promise<void> {
        const entregadorId = this.entregadorEscolhido(pedidoId);
        if (!entregadorId) return this.alerta('warning', `Escolha o motoboy do pedido nº ${pedidoId}.`);

        botao.disabled = true; // dois cliques não despacham duas vezes
        const resposta = await window.api.chamar<number>('entregas:sair', {
            pedido_id: pedidoId,
            entregador_id: entregadorId,
            observacao: null,
        });
        if (!resposta.ok) {
            botao.disabled = false;
            return this.alerta('danger', resposta.erro);
        }
        this.alerta('success', `Pedido nº ${pedidoId} saiu para entrega.`);
        await this.carregar();
    }

    // ===================================================================
    // LISTA 2: NA RUA AGORA
    // ===================================================================

    private desenharRua(): void {
        const corpo = this.el('entregas-rua');
        if (this.naRua.length === 0) {
            corpo.innerHTML = '<tr><td colspan="6" class="text-secondary">Nenhuma entrega na rua.</td></tr>';
            return;
        }
        corpo.innerHTML = this.naRua
            .map(
                (e) => `
        <tr>
          <td>${e.pedido_id}</td>
          <td>${escapar(e.cliente_nome)}</td>
          <td>${escapar(e.entregador_nome)}</td>
          <td>${hora.format(new Date(e.saiu_em))}</td>
          <td class="text-end">${reais.format(e.valor_entrega)}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-success" data-acao="entregue" data-id="${e.id}">Entregue</button>
            <button type="button" class="btn btn-sm btn-outline-warning" data-acao="nao-entregue" data-id="${e.id}">Não entregue</button>
          </td>
        </tr>`,
            )
            .join('');
    }

    private async entregue(entregaId: number): Promise<void> {
        const entrega = this.naRua.find((e) => e.id === entregaId);
        if (!entrega) return;
        const texto = `Marcar o pedido nº ${entrega.pedido_id} (${entrega.cliente_nome}) como ENTREGUE?`;
        if (!(await confirmar('Confirmar entrega', texto, 'Entregue'))) return;

        const resposta = await window.api.chamar<void>('entregas:entregue', entregaId);
        if (!resposta.ok) return this.alerta('danger', resposta.erro);
        this.alerta('success', `Pedido nº ${entrega.pedido_id} entregue.`);
        await this.carregar();
    }

    private abrirMotivo(entregaId: number): void {
        const entrega = this.naRua.find((e) => e.id === entregaId);
        if (!entrega) return;
        this.entregaDoMotivo = entregaId;
        this.el('entregas-motivo-titulo').textContent =
            `Não entregue: pedido nº ${entrega.pedido_id} (${entrega.cliente_nome})`; // textContent: nunca vira HTML
        this.el<HTMLInputElement>('entregas-motivo').value = '';
        this.el('entregas-motivo-card').classList.remove('d-none');
        this.el<HTMLInputElement>('entregas-motivo').focus();
    }

    private fecharMotivo(): void {
        this.entregaDoMotivo = null;
        this.el('entregas-motivo-card').classList.add('d-none');
    }

    private async naoEntregue(): Promise<void> {
        if (this.entregaDoMotivo === null) return;
        const motivo = this.el<HTMLInputElement>('entregas-motivo').value.trim();
        if (!motivo) return this.alerta('warning', 'Informe o motivo da não entrega.');

        const resposta = await window.api.chamar<void>('entregas:naoEntregue', {
            id: this.entregaDoMotivo,
            observacao: motivo,
        });
        if (!resposta.ok) return this.alerta('danger', resposta.erro);
        this.fecharMotivo();
        this.alerta('info', 'Não entrega registrada. O pedido voltou para "Prontos para sair".');
        await this.carregar();
    }

    // ===================================================================
    // AJUDANTES
    // ===================================================================

    private el<T extends HTMLElement = HTMLElement>(id: string): T {
        const elemento = this.app.querySelector<T>(`#${id}`);
        if (!elemento) throw new Error(`Elemento #${id} não encontrado na página de entregas.`);
        return elemento;
    }

    private alerta(tipo: TipoAlerta, mensagem: string): void {
        mostrarAlerta(this.el('entregas-alerta'), tipo, mensagem);
    }
}