// =====================================================================
// IpcRouter.ts — o "GARÇOM" entre a tela e o Main
// ---------------------------------------------------------------------
// Na analogia do restaurante:
//   - a TELA é o cliente no salão (faz o pedido, nunca entra na cozinha);
//   - o PRELOAD é o balcão (só deixa passar o que está no cardápio);
//   - o IPCROUTER é o garçom: antes de levar o pedido para a cozinha,
//     ele confere QUEM está pedindo e se essa pessoa PODE pedir aquilo;
//   - os SERVICES são a cozinha (as regras de negócio).
//
// Todo canal do sistema é registrado aqui com 3 informações:
//
//   router.registrar('clientes:excluir', ['ADMIN'], (dados, usuario) => ...)
//                     └── qual canal      └── quem pode  └── o que fazer
//
// E TODA resposta volta no mesmo formato (Resposta<T> do tipos.ts):
//   { ok: true,  dados: ... }   deu certo
//   { ok: false, erro: '...' }  deu errado (mensagem pronta para a tela)
// =====================================================================

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { Perfil, Resposta, Usuario } from '../../shared/tipos';
import { CANAIS_PERMITIDOS } from '../../shared/canais';
import { ErroDeNegocio } from '../security/ErroDeNegocio';
import { Sessao } from '../security/Sessao';
import { ehEnderecoDoSistema } from '../security/origem';

/**
 * O "trabalho" de cada canal: recebe os dados que a tela mandou e quem
 * está logado (ou null), e devolve o resultado.
 * E = tipo da Entrada (o que a tela manda); S = tipo da Saída.
 */
export type Handler<E, S> = (dados: E, usuario: Usuario | null) => Promise<S>;

export class IpcRouter {
  // Canais já registrados, para pegar o erro de registrar o mesmo
  // canal duas vezes (ex.: duas linhas iguais no main.ts).
  private readonly registrados = new Set<string>();

  /**
   * Registra um canal.
   * perfis: quem pode usar. 'PUBLICO' = qualquer um, até sem login
   * (só o auth:login usa isso).
   */
  registrar<E, S>(
    canal: string,
    perfis: Perfil[] | 'PUBLICO',
    handler: Handler<E, S>,
  ): void {
    // Erros de PROGRAMAÇÃO: aparecem no terminal assim que o programa
    // abre, para quem esqueceu um passo do "Como criar um módulo".
    if (!CANAIS_PERMITIDOS.includes(canal)) {
      throw new Error(
        `O canal "${canal}" não está em CANAIS_PERMITIDOS (src/shared/canais.ts).`,
      );
    }
    if (this.registrados.has(canal)) {
      throw new Error(`O canal "${canal}" foi registrado duas vezes.`);
    }
    this.registrados.add(canal);

    // ipcMain.handle = "quando a tela chamar este canal, faça isto".
    // Tudo dentro do try: NENHUM erro escapa sem virar uma Resposta.
    ipcMain.handle(
      canal,
      async (evento: IpcMainInvokeEvent, dados: E): Promise<Resposta<S>> => {
        try {
          // 1. O pedido veio da NOSSA tela? (e não de uma página estranha)
          if (!ehEnderecoDoSistema(evento.senderFrame?.url ?? '')) {
            console.error(`[IpcRouter] Pedido recusado de origem desconhecida: ${canal}`);
            return { ok: false, erro: 'Pedido recusado.' };
          }

          // 2. Tem alguém logado? Essa pessoa tem o perfil necessário?
          const usuario = Sessao.atual();
          if (perfis !== 'PUBLICO') {
            if (usuario === null) {
              return { ok: false, erro: 'Faça login para continuar.' };
            }
            if (!perfis.includes(usuario.perfil)) {
              return { ok: false, erro: 'Você não tem permissão para fazer isso.' };
            }
          }

          // 3. Tudo certo: leva o pedido para a "cozinha".
          const resultado = await handler(dados, usuario);
          return { ok: true, dados: resultado };
        } catch (erro) {
          // 4a. Regra de negócio quebrada: a mensagem vai para a tela.
          if (erro instanceof ErroDeNegocio) {
            return { ok: false, erro: erro.message };
          }
          // 4b. Qualquer outro erro: detalhe SÓ no terminal; a tela
          //     recebe uma frase genérica (não revela tabelas, SQL etc.).
          console.error(`[IpcRouter] Erro inesperado no canal "${canal}":`, erro);
          return { ok: false, erro: 'Erro inesperado.' };
        }
      },
    );
  }
}
