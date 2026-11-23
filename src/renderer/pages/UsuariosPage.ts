// =====================================================================
// UsuariosPage.ts — a tela de usuários (só ADMIN)
// ---------------------------------------------------------------------
// Uma tela só, com duas partes:
//   1. o FORMULÁRIO (escondido até clicar em "Novo usuário", "Editar"
//      ou "Senha"). Ele tem 3 "modos":
//        novo   -> nome, e-mail, perfil e senha
//        editar -> nome e perfil (o e-mail aparece, mas não muda)
//        senha  -> só a senha nova
//   2. a LISTA, com os botões de cada usuário.
//
// Os botões da lista NÃO têm onclick (a CSP bloqueia). Um único
// "ouvinte" fica na tabela e descobre qual botão foi clicado pelos
// atributos data-acao e data-id ("delegação de eventos").
//
// Lembrete: os bloqueios desta tela (ex.: o botão "Desativar" de si
// mesmo vem desligado) são só conforto. Quem garante é o Main.
// =====================================================================

import type { Perfil, UsuarioSemSenha } from '../../shared/tipos';
import { confirmar, escapar, mostrarAlerta } from '../ui';

type Modo = 'novo' | 'editar' | 'senha';

export class UsuariosPage {
  private app!: HTMLElement;
  private usuarios: UsuarioSemSenha[] = [];
  private logadoId = 0; // id de quem está usando o sistema
  private modo: Modo = 'novo';
  private idEmEdicao: number | null = null;

  async render(app: HTMLElement): Promise<void> {
    this.app = app;
    app.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">Usuários</h2>
        <button type="button" id="usuarios-novo" class="btn btn-primary">Novo usuário</button>
      </div>
      <div id="usuarios-alerta"></div>

      <div id="usuarios-form-card" class="card mb-3 d-none">
        <div class="card-body">
          <h3 id="usuarios-form-titulo" class="h6 mb-3"></h3>
          <form id="usuarios-form" class="row g-3" novalidate>
            <div class="col-md-4" data-campo="nome">
              <label for="usuarios-nome" class="form-label">Nome</label>
              <input id="usuarios-nome" class="form-control" maxlength="100">
            </div>
            <div class="col-md-4" data-campo="email">
              <label for="usuarios-email" class="form-label">E-mail</label>
              <input id="usuarios-email" type="email" class="form-control" maxlength="150">
            </div>
            <div class="col-md-2" data-campo="perfil">
              <label for="usuarios-perfil" class="form-label">Perfil</label>
              <select id="usuarios-perfil" class="form-select">
                <option value="ATENDENTE">ATENDENTE</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div class="col-md-4" data-campo="senha">
              <label for="usuarios-senha" class="form-label">Senha</label>
              <input id="usuarios-senha" type="password" class="form-control" autocomplete="new-password">
              <div class="form-text">Mínimo de 8 caracteres, com letras e números.</div>
            </div>
            <div class="col-12">
              <button type="submit" id="usuarios-salvar" class="btn btn-success">Salvar</button>
              <button type="button" id="usuarios-cancelar" class="btn btn-outline-secondary ms-2">Cancelar</button>
            </div>
          </form>
        </div>
      </div>

      <div class="table-responsive">
      <table class="table table-striped align-middle bg-white border">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Situação</th>
            <th>Criado em</th>
            <th class="text-end">Ações</th>
          </tr>
        </thead>
        <tbody id="usuarios-lista">
          <tr><td colspan="6" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>
      </div>`;

    // Ligações dos botões (uma vez só, ao abrir a tela).
    this.el('usuarios-novo').addEventListener('click', () => this.abrirFormulario('novo'));
    this.el('usuarios-cancelar').addEventListener('click', () => this.fecharFormulario());
    this.el('usuarios-form').addEventListener('submit', (evento) => {
      evento.preventDefault();
      void this.salvar();
    });
    this.el('usuarios-lista').addEventListener('click', (evento) => {
      const botao = (evento.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
      if (botao) void this.executarAcao(botao.dataset.acao ?? '', Number(botao.dataset.id));
    });

    // Quem está logado? (para desligar os botões de "si mesmo")
    const atual = await window.api.chamar<UsuarioSemSenha>('auth:atual');
    if (atual.ok) this.logadoId = atual.dados.id;

    await this.carregar();
  }

  // -------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------

  /** Busca os usuários no Main e desenha a tabela. */
  private async carregar(): Promise<void> {
    const resposta = await window.api.chamar<UsuarioSemSenha[]>('usuarios:listar');
    const lista = this.el('usuarios-lista');

    if (!resposta.ok) {
      lista.innerHTML = '';
      this.alerta('danger', resposta.erro);
      return;
    }

    this.usuarios = resposta.dados;
    if (this.usuarios.length === 0) {
      lista.innerHTML =
        '<tr><td colspan="6" class="text-secondary">Nenhum usuário cadastrado.</td></tr>';
      return;
    }

    lista.innerHTML = this.usuarios.map((u) => this.linha(u)).join('');
  }

  /** O HTML de uma linha da tabela. Todo texto do banco passa pelo escapar(). */
  private linha(u: UsuarioSemSenha): string {
    const souEu = u.id === this.logadoId;
    const corPerfil = u.perfil === 'ADMIN' ? 'primary' : 'secondary';
    const criadoEm = u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-';
    const naoPode = souEu ? 'disabled title="Você não pode fazer isso com o seu próprio usuário"' : '';

    return `
      <tr class="${u.ativo ? '' : 'text-secondary'}">
        <td>${escapar(u.nome)}${souEu ? ' <span class="badge text-bg-info">você</span>' : ''}</td>
        <td>${escapar(u.email)}</td>
        <td><span class="badge text-bg-${corPerfil}">${escapar(u.perfil)}</span></td>
        <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>${criadoEm}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary" data-acao="editar" data-id="${u.id}">Editar</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-acao="senha" data-id="${u.id}">Senha</button>
          <button type="button" class="btn btn-sm btn-outline-warning" data-acao="${u.ativo ? 'desativar' : 'ativar'}" data-id="${u.id}" ${u.ativo ? naoPode : ''}>${u.ativo ? 'Desativar' : 'Ativar'}</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir" data-id="${u.id}" ${naoPode}>Excluir</button>
        </td>
      </tr>`;
  }

  /** Decide o que fazer conforme o botão clicado na lista. */
  private async executarAcao(acao: string, id: number): Promise<void> {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) return;

    if (acao === 'editar') this.abrirFormulario('editar', usuario);
    if (acao === 'senha') this.abrirFormulario('senha', usuario);
    if (acao === 'ativar' || acao === 'desativar') {
      const ativo = acao === 'ativar';
      await this.enviar(
        'usuarios:alterarAtivo',
        { id, ativo },
        `${usuario.nome} foi ${ativo ? 'ativado' : 'desativado'}.`,
      );
    }
    if (acao === 'excluir') {
      const certeza = await confirmar(
        'Excluir usuário',
        `Excluir "${usuario.nome}" (${usuario.email})? Esta ação não pode ser desfeita.`,
        'Excluir',
      );
      if (certeza) await this.enviar('usuarios:excluir', id, `${usuario.nome} foi excluído.`);
    }
  }

  // -------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------

  /** Mostra o formulário no modo pedido, já preenchido se for edição. */
  private abrirFormulario(modo: Modo, usuario?: UsuarioSemSenha): void {
    this.modo = modo;
    this.idEmEdicao = usuario?.id ?? null;

    const titulos: Record<Modo, string> = {
      novo: 'Novo usuário',
      editar: `Editar: ${usuario?.nome ?? ''}`,
      senha: `Nova senha para: ${usuario?.nome ?? ''}`,
    };
    this.el('usuarios-form-titulo').textContent = titulos[modo];

    // Quais campos aparecem em cada modo.
    const visiveis: Record<Modo, string[]> = {
      novo: ['nome', 'email', 'perfil', 'senha'],
      editar: ['nome', 'email', 'perfil'],
      senha: ['senha'],
    };
    this.app.querySelectorAll<HTMLElement>('#usuarios-form [data-campo]').forEach((campo) => {
      campo.classList.toggle('d-none', !visiveis[modo].includes(campo.dataset.campo ?? ''));
    });

    this.input('usuarios-nome').value = usuario?.nome ?? '';
    this.input('usuarios-email').value = usuario?.email ?? '';
    this.input('usuarios-email').disabled = modo !== 'novo'; // e-mail não muda depois
    (this.el('usuarios-perfil') as HTMLSelectElement).value = usuario?.perfil ?? 'ATENDENTE';
    this.input('usuarios-senha').value = '';

    this.el('usuarios-form-card').classList.remove('d-none');
    (modo === 'senha' ? this.input('usuarios-senha') : this.input('usuarios-nome')).focus();
  }

  private fecharFormulario(): void {
    this.el('usuarios-form-card').classList.add('d-none');
    this.input('usuarios-senha').value = '';
  }

  /** Envia o formulário para o canal certo, conforme o modo. */
  private async salvar(): Promise<void> {
    const nome = this.input('usuarios-nome').value;
    const perfil = (this.el('usuarios-perfil') as HTMLSelectElement).value as Perfil;
    const senha = this.input('usuarios-senha').value;

    if (this.modo === 'senha') {
      await this.enviar('usuarios:redefinirSenha', { id: this.idEmEdicao, senha }, 'Senha alterada.');
      return;
    }

    const dados =
      this.modo === 'novo'
        ? { nome, email: this.input('usuarios-email').value, perfil, senha }
        : { id: this.idEmEdicao, nome, perfil };
    const editouASiMesmo = this.idEmEdicao === this.logadoId;

    const deuCerto = await this.enviar('usuarios:salvar', dados, 'Usuário salvo.');
    // Mudou o próprio nome? Avisa o renderer.ts para atualizar o topo.
    if (deuCerto && editouASiMesmo) window.dispatchEvent(new Event('sessao-alterada'));
  }

  /**
   * Manda um pedido ao Main. Deu certo: fecha o formulário, recarrega a
   * lista e mostra a mensagem verde. Deu errado: mostra o erro do Main.
   */
  private async enviar(canal: string, dados: unknown, sucesso: string): Promise<boolean> {
    const botao = this.el('usuarios-salvar') as HTMLButtonElement;
    botao.disabled = true;
    const resposta = await window.api.chamar(canal, dados);
    botao.disabled = false;

    if (!resposta.ok) {
      this.alerta('danger', resposta.erro);
      return false;
    }
    this.fecharFormulario();
    await this.carregar();
    this.alerta('success', sucesso);
    return true;
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
    mostrarAlerta(this.el('usuarios-alerta'), tipo, mensagem);
  }
}
