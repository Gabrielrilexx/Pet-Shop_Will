// =====================================================================
// Sessao.ts — o "CRACHÁ" de quem está usando o sistema agora
// ---------------------------------------------------------------------
// Quando alguém faz login, o Main guarda aqui QUEM entrou. Quando sai,
// apaga. O IpcRouter consulta este crachá a cada pedido da tela para
// saber se tem alguém logado e qual é o perfil (ADMIN ou ATENDENTE).
//
// Por que fica no MAIN e não na tela? Porque a tela pode ser mexida
// pelo DevTools. Se o perfil ficasse lá, bastaria alguém escrever
// "perfil = 'ADMIN'" no console para virar administrador. Aqui, a tela
// não alcança.
//
// "static" = existe UM crachá só para o sistema inteiro (é um programa
// desktop: uma pessoa usa por vez).
//
// Quem chama entrar() e sair(): o AuthService (Passo 7, login).
// =====================================================================

import type { Usuario } from '../../shared/tipos';

export class Sessao {
  // Começa vazio: ninguém logado quando o programa abre.
  private static usuario: Usuario | null = null;

  /** Guarda quem acabou de fazer login. */
  static entrar(usuario: Usuario): void {
    Sessao.usuario = usuario;
  }

  /** Apaga o crachá (logout). */
  static sair(): void {
    Sessao.usuario = null;
  }

  /** Quem está logado agora, ou null se ninguém. */
  static atual(): Usuario | null {
    return Sessao.usuario;
  }
}
