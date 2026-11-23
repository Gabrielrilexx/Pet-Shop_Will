// =====================================================================
// LoginPage.ts — a tela de entrada
// ---------------------------------------------------------------------
// É a única tela que aparece antes do login. Quando o login dá certo,
// ela avisa o renderer.ts (pela função "aoEntrar"), que então mostra o
// menu e abre o sistema.
//
// Segurança na tela (lembrando: quem decide de verdade é o Main):
//   - o botão é ligado por addEventListener (a CSP bloqueia onclick="");
//   - a senha é apagada do campo depois de um erro;
//   - a mensagem de erro é a que o Main mandou, via textContent.
// =====================================================================

import type { UsuarioSemSenha } from '../../shared/tipos';
import { mostrarAlerta } from '../ui';

export class LoginPage {
  /** aoEntrar: o que fazer quando o login der certo (vem do renderer.ts). */
  constructor(private readonly aoEntrar: (usuario: UsuarioSemSenha) => void) {}

  async render(app: HTMLElement): Promise<void> {
    app.innerHTML = `
      <div class="row justify-content-center mt-5">
        <div class="col-sm-8 col-md-6 col-lg-4">
          <div class="card shadow-sm">
            <div class="card-body p-4">
              <h1 class="h4 mb-1">🐾 Pet Shop</h1>
              <p class="text-secondary mb-4">Entre com o seu e-mail e senha.</p>
              <div id="login-alerta"></div>
              <form id="login-form" novalidate>
                <div class="mb-3">
                  <label for="login-email" class="form-label">E-mail</label>
                  <input type="email" id="login-email" class="form-control" autocomplete="username" required>
                </div>
                <div class="mb-4">
                  <label for="login-senha" class="form-label">Senha</label>
                  <input type="password" id="login-senha" class="form-control" autocomplete="current-password" required>
                </div>
                <button type="submit" id="login-botao" class="btn btn-primary w-100">Entrar</button>
              </form>
            </div>
          </div>
        </div>
      </div>`;

    const form = app.querySelector('#login-form') as HTMLFormElement;
    const email = app.querySelector('#login-email') as HTMLInputElement;
    const senha = app.querySelector('#login-senha') as HTMLInputElement;
    const botao = app.querySelector('#login-botao') as HTMLButtonElement;
    const alerta = app.querySelector('#login-alerta') as HTMLElement;

    email.focus();

    // "submit" dispara tanto no clique do botão quanto no Enter do teclado.
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault(); // não deixa o formulário recarregar a página

      // Trava o botão enquanto espera (evita clique duplo).
      botao.disabled = true;
      botao.textContent = 'Entrando...';

      const resposta = await window.api.chamar<UsuarioSemSenha>('auth:login', {
        email: email.value,
        senha: senha.value,
      });

      if (resposta.ok) {
        this.aoEntrar(resposta.dados);
        return;
      }

      // Deu errado: mostra a mensagem do Main e limpa a senha.
      mostrarAlerta(alerta, 'danger', resposta.erro);
      senha.value = '';
      senha.focus();
      botao.disabled = false;
      botao.textContent = 'Entrar';
    });
  }
}
