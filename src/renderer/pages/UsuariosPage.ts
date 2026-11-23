// =====================================================================
// UsuariosPage.ts — a tela de usuários
// ---------------------------------------------------------------------
// Passo 6: só a LISTA, como exemplo de ponta a ponta para o grupo:
//
//   UsuariosPage --chamar('usuarios:listar')--> preload --> IpcRouter
//     --> confere login e perfil --> UsuarioService --> UsuarioRepository
//     --> Database --> MySQL ... e a resposta faz o caminho de volta.
//
// Passo 9: formulário de cadastro, edição, ativar/desativar e senha.
// =====================================================================

import type { UsuarioSemSenha } from '../../shared/tipos';
import { escapar, mostrarAlerta } from '../ui';

export class UsuariosPage {
  async render(app: HTMLElement): Promise<void> {
    // 1. Desenha o "esqueleto" da tela (sem dados ainda).
    app.innerHTML = `
      <h2 class="h4 mb-3">Usuários</h2>
      <div id="usuarios-alerta"></div>
      <table class="table table-striped align-middle bg-white border">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Situação</th>
            <th>Criado em</th>
          </tr>
        </thead>
        <tbody id="usuarios-lista">
          <tr><td colspan="5" class="text-secondary">Carregando...</td></tr>
        </tbody>
      </table>`;

    const alerta = app.querySelector('#usuarios-alerta') as HTMLElement;
    const lista = app.querySelector('#usuarios-lista') as HTMLElement;

    // 2. Pede os dados ao Main (pelo balcão do preload) e ESPERA.
    const resposta = await window.api.chamar<UsuarioSemSenha[]>('usuarios:listar');

    // 3a. Deu errado: mostra a mensagem que o Main mandou.
    if (!resposta.ok) {
      lista.innerHTML = '';
      mostrarAlerta(alerta, 'danger', resposta.erro);
      return;
    }

    // 3b. Deu certo, mas a lista está vazia.
    if (resposta.dados.length === 0) {
      lista.innerHTML =
        '<tr><td colspan="5" class="text-secondary">Nenhum usuário cadastrado.</td></tr>';
      return;
    }

    // 3c. Deu certo: uma linha da tabela para cada usuário.
    //     Todo texto que veio do banco passa pelo escapar().
    lista.innerHTML = resposta.dados
      .map(
        (u) => `
        <tr>
          <td>${escapar(u.nome)}</td>
          <td>${escapar(u.email)}</td>
          <td><span class="badge text-bg-${u.perfil === 'ADMIN' ? 'primary' : 'secondary'}">${escapar(u.perfil)}</span></td>
          <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
          <td>${u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
        </tr>`,
      )
      .join('');
  }
}
