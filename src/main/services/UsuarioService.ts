// =====================================================================
// UsuarioService.ts — as REGRAS dos usuários
// ---------------------------------------------------------------------
// O service é a "cozinha": recebe o pedido do IpcRouter, aplica as
// regras e usa o repository para buscar ou gravar.
//
// Regras deste módulo (todas conferidas AQUI, no Main):
//   1. O senha_hash NUNCA sai daqui para a tela (UsuarioSemSenha).
//   2. Senha nova passa pelo Validador.senha e vira hash (bcrypt).
//   3. O ADMIN não pode desativar, excluir nem rebaixar A SI MESMO.
//      Assim o sistema nunca fica sem quem consiga administrar.
//   4. O e-mail é o "nome de login": não muda depois do cadastro.
//
// Quem pode chamar: só ADMIN (o IpcRouter já conferiu).
// "logado" = quem está usando o sistema agora (vem do IpcRouter).
// =====================================================================

import type { Perfil, Usuario, UsuarioSemSenha } from '../../shared/tipos';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { PasswordHasher } from '../security/PasswordHasher';
import { Sessao } from '../security/Sessao';
import { Validador } from '../security/Validador';

export class UsuarioService {
  // Injeção de dependência: recebe o repository pronto (ou cria um).
  constructor(private readonly usuarios: UsuarioRepository = new UsuarioRepository()) {}

  /** Lista todos os usuários, sem o senha_hash. */
  async listar(): Promise<UsuarioSemSenha[]> {
    const lista = await this.usuarios.listar();
    return lista.map(UsuarioService.semSenha);
  }

  /**
   * Sem id -> cadastra (nome, e-mail, perfil e senha).
   * Com id -> edita nome e perfil. Devolve o id.
   */
  async salvar(dados: unknown, logado: Usuario): Promise<number> {
    const bruto = (dados ?? {}) as Record<string, unknown>;
    const nome = Validador.tamanhoMaximo(Validador.obrigatorio(bruto.nome, 'Nome'), 100, 'Nome');
    const perfil = UsuarioService.perfil(bruto.perfil);

    // ---------- Cadastro ----------
    if (bruto.id === undefined || bruto.id === null || bruto.id === '') {
      const email = Validador.tamanhoMaximo(Validador.email(bruto.email), 150, 'E-mail');
      const senha = Validador.senha(bruto.senha);
      return this.usuarios.inserir({
        nome,
        email,
        senha_hash: await PasswordHasher.gerar(senha),
        perfil,
        ativo: true,
      });
    }

    // ---------- Edição ----------
    const atual = await this.buscarOuFalhar(bruto.id);
    if (atual.id === logado.id && perfil !== atual.perfil) {
      throw new ErroDeNegocio('Você não pode mudar o seu próprio perfil.');
    }
    // E-mail e situação (ativo) continuam os mesmos.
    await this.usuarios.atualizar(atual.id, { ...atual, nome, perfil });

    // Editou a si mesmo? Atualiza o "crachá" com o nome novo.
    if (atual.id === logado.id) {
      Sessao.entrar({ ...logado, nome });
    }
    return atual.id;
  }

  /** Ativa ou desativa um usuário. */
  async alterarAtivo(dados: unknown, logado: Usuario): Promise<void> {
    const bruto = (dados ?? {}) as Record<string, unknown>;
    const usuario = await this.buscarOuFalhar(bruto.id);
    const ativo = bruto.ativo === true;

    if (usuario.id === logado.id && !ativo) {
      throw new ErroDeNegocio('Você não pode desativar a si mesmo.');
    }
    await this.usuarios.alterarAtivo(usuario.id, ativo);
  }

  /** Define uma senha nova para o usuário (o ADMIN informa a senha). */
  async redefinirSenha(dados: unknown): Promise<void> {
    const bruto = (dados ?? {}) as Record<string, unknown>;
    const usuario = await this.buscarOuFalhar(bruto.id);
    const senha = Validador.senha(bruto.senha);
    await this.usuarios.atualizarSenha(usuario.id, await PasswordHasher.gerar(senha));
  }

  /**
   * Exclui um usuário. Quem já registrou pedidos não pode ser excluído
   * (o BaseRepository avisa: "Este registro está em uso..."): nesse
   * caso, o certo é DESATIVAR, para o histórico de vendas continuar.
   */
  async excluir(id: unknown, logado: Usuario): Promise<void> {
    const usuario = await this.buscarOuFalhar(id);
    if (usuario.id === logado.id) {
      throw new ErroDeNegocio('Você não pode excluir a si mesmo.');
    }
    await this.usuarios.excluir(usuario.id);
  }

  /**
   * Tira o senha_hash de um usuário.
   * O "...resto" junta todos os outros campos num objeto novo.
   * O "_" no nome avisa: "peguei, mas não vou usar".
   */
  static semSenha({ senha_hash: _senha, ...resto }: Usuario): UsuarioSemSenha {
    return resto;
  }

  // -------------------------------------------------------------------
  // Ajudantes internos
  // -------------------------------------------------------------------

  /** Busca pelo id; se o id for inválido ou não existir, avisa. */
  private async buscarOuFalhar(id: unknown): Promise<Usuario> {
    const numero = Number(id);
    const usuario = Number.isInteger(numero) && numero > 0
      ? await this.usuarios.buscarPorId(numero)
      : null;
    if (usuario === null) {
      throw new ErroDeNegocio('Registro não encontrado.');
    }
    return usuario;
  }

  /** Só aceita os dois perfis que existem. */
  private static perfil(v: unknown): Perfil {
    if (v !== 'ADMIN' && v !== 'ATENDENTE') {
      throw new ErroDeNegocio('Perfil inválido.');
    }
    return v;
  }
}
