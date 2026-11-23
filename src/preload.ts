// =====================================================================
// preload.ts — o "BALCÃO" entre a tela e o Main
// ---------------------------------------------------------------------
// A tela (renderer) roda isolada, como um site: não tem acesso ao
// Node, ao banco nem aos arquivos do computador. A ÚNICA porta que ela
// enxerga é a que o preload abre aqui: window.api.chamar(...).
//
// O balcão tem duas regras:
//   1. só aceita pedidos que estão no CARDÁPIO (CANAIS_PERMITIDOS);
//   2. não entrega para a tela nenhuma ferramenta do Electron (como o
//      ipcRenderer inteiro): só a função "chamar", e mais nada.
//
// Uso na tela:
//   const resposta = await window.api.chamar<Cliente[]>('clientes:listar');
//   if (resposta.ok) { ... resposta.dados ... } else { ... resposta.erro ... }
// =====================================================================

import { contextBridge, ipcRenderer } from 'electron';
import { CANAIS_PERMITIDOS } from './shared/canais';
import type { Resposta } from './shared/tipos';

const api = {
  /**
   * Manda um pedido para o Main e espera a resposta.
   * Nunca "estoura" erro: sempre devolve uma Resposta { ok, ... }.
   */
  chamar<T>(canal: string, dados?: unknown): Promise<Resposta<T>> {
    // Regra 1: pedido fora do cardápio é recusado aqui mesmo.
    if (!CANAIS_PERMITIDOS.includes(canal)) {
      return Promise.resolve({ ok: false, erro: `Canal não permitido: ${canal}` });
    }

    // invoke = "pedir e esperar a resposta" (igual a um pedido de
    // delivery: você pede e aguarda o entregador voltar).
    return ipcRenderer.invoke(canal, dados).catch((erro: unknown) => {
      // Só cai aqui se ninguém registrou o canal no Main (o colega
      // colocou no canais.ts, mas ainda não ligou no main.ts).
      console.error(`[preload] Falha no canal "${canal}":`, erro);
      return { ok: false, erro: 'Esta função ainda não está disponível.' };
    }) as Promise<Resposta<T>>;
  },
};

// Abre a porta: a partir daqui a tela enxerga "window.api".
contextBridge.exposeInMainWorld('api', api);

/** O formato do window.api (usado pelo src/renderer/global.d.ts). */
export type Api = typeof api;
