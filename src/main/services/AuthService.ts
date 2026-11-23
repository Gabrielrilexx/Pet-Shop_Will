// =====================================================================
// AuthService.ts — o "PORTEIRO" do sistema (login e logout)
// ---------------------------------------------------------------------
// Regras de segurança do login (Arquitetura do projeto):
//
//   1. Mensagem GENÉRICA: errou o e-mail OU a senha, a resposta é a
//      mesma ("E-mail ou senha inválidos."). Se disséssemos "e-mail não
//      cadastrado", um atacante descobriria quais e-mails existem.
//
//   2. BLOQUEIO: 5 erros seguidos no mesmo e-mail = 5 minutos sem poder
//      tentar. Isso impede alguém de testar milhares de senhas.
//
//   3. Tempo igual: mesmo quando o e-mail não existe, o bcrypt roda
//      (contra um hash falso). Assim a resposta demora o mesmo tanto e
//      ninguém descobre pelo relógio se o e-mail existe.
//
// O controle de erros fica na memória do Main: fechou o programa,
// zera. Para um sistema desktop de uma loja, é suficiente.
// =====================================================================

import type { Usuario, UsuarioSemSenha } from '../../shared/tipos';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { PasswordHasher } from '../security/PasswordHasher';
import { Sessao } from '../security/Sessao';
import { UsuarioService } from './UsuarioService';

const MAX_ERROS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000; // 5 minutos em milissegundos

// Hash de uma senha aleatória que ninguém sabe (regra 3 acima).
const HASH_FALSO = '$2b$10$HipZLhgeV99bMp4zj0FFbOp3s7AE4vuDFWp6vNGOTEGVXYKCbJDOO';

/** Ficha de erros de um e-mail. */
interface Tentativas {
  erros: number; // erros seguidos
  bloqueadoAte: number; // horário (em ms) em que o bloqueio acaba; 0 = livre
}

export class AuthService {
  // Uma ficha por e-mail: "fulano@x.com" -> { erros: 3, bloqueadoAte: 0 }
  private readonly tentativas = new Map<string, Tentativas>();

  constructor(
    private readonly usuarios: UsuarioRepository = new UsuarioRepository(),
    // "Relógio" do serviço. Nos testes dá para trocar por um relógio
    // falso e simular os 5 minutos sem esperar de verdade.
    private readonly agora: () => number = Date.now,
  ) {}

  /** Faz o login. Se der certo, guarda na Sessao e devolve o usuário sem senha. */
  async login(dados: unknown): Promise<UsuarioSemSenha> {
    const { email, senha } = AuthService.lerCredenciais(dados);

    // 1. Este e-mail está de castigo?
    this.conferirBloqueio(email);

    // 2. Busca o usuário e confere a senha (sempre roda o bcrypt).
    const usuario = await this.usuarios.buscarPorEmail(email);
    const senhaCerta = await PasswordHasher.conferir(senha, usuario?.senha_hash ?? HASH_FALSO);

    if (usuario === null || !senhaCerta) {
      this.registrarErro(email);
      throw new ErroDeNegocio('E-mail ou senha inválidos.');
    }

    // 3. Senha certa, mas o ADMIN desativou esta conta.
    //    (Aqui já podemos ser específicos: quem chegou até aqui sabe a senha.)
    if (!usuario.ativo) {
      throw new ErroDeNegocio('Usuário desativado. Fale com o administrador.');
    }

    // 4. Deu certo: zera a ficha de erros e entrega o "crachá".
    this.tentativas.delete(email);
    Sessao.entrar(usuario);
    return UsuarioService.semSenha(usuario);
  }

  /** Logout: apaga o crachá. */
  sair(): void {
    Sessao.sair();
  }

  /** Quem está logado agora (sem senha). O IpcRouter já garante que tem alguém. */
  atual(usuario: Usuario): UsuarioSemSenha {
    return UsuarioService.semSenha(usuario);
  }

  // -------------------------------------------------------------------
  // Ajudantes internos
  // -------------------------------------------------------------------

  /** Lança erro se o e-mail estiver bloqueado, dizendo quanto falta. */
  private conferirBloqueio(email: string): void {
    const ficha = this.tentativas.get(email);
    const falta = (ficha?.bloqueadoAte ?? 0) - this.agora();
    if (falta > 0) {
      const minutos = Math.ceil(falta / 60_000);
      throw new ErroDeNegocio(
        `Muitas tentativas erradas. Tente de novo em ${minutos} minuto(s).`,
      );
    }
  }

  /** Conta mais um erro; no 5º, bloqueia por 5 minutos e zera a contagem. */
  private registrarErro(email: string): void {
    const ficha = this.tentativas.get(email) ?? { erros: 0, bloqueadoAte: 0 };
    ficha.erros += 1;
    if (ficha.erros >= MAX_ERROS) {
      ficha.erros = 0;
      ficha.bloqueadoAte = this.agora() + BLOQUEIO_MS;
    }
    this.tentativas.set(email, ficha);
  }

  /**
   * Lê o e-mail e a senha do que a tela mandou, sem confiar no formato.
   * O e-mail vai para minúsculas: "Caio@X.com" e "caio@x.com" são o mesmo.
   */
  private static lerCredenciais(dados: unknown): { email: string; senha: string } {
    const bruto = (dados ?? {}) as { email?: unknown; senha?: unknown };
    const email = String(bruto.email ?? '').trim().toLowerCase();
    const senha = String(bruto.senha ?? '');
    if (email === '' || senha === '') {
      throw new ErroDeNegocio('Informe o e-mail e a senha.');
    }
    return { email, senha };
  }
}
