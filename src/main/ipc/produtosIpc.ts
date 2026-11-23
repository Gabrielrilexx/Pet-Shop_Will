// =====================================================================
// produtosIpc.ts — os canais de produtos
// ---------------------------------------------------------------------
// Liga cada canal a um método do ProdutoService.
//
// Permissões (tabela da Arquitetura):
//   produtos:listar -> ADMIN, ATENDENTE (ATENDENTE sem custo e margem)
//   produtos:salvar, produtos:excluir, produtos:cotacao -> ADMIN
//
// O 2º parâmetro do handler é QUEM está logado (vem da Sessao, no Main).
// É dele que sai o perfil para o corte do custo: a tela não consegue
// mentir o próprio perfil. O "usuario!" é seguro porque nenhum canal
// aqui é PUBLICO (o IpcRouter já recusou quem não está logado).
// =====================================================================

import type { Produto } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { ProdutoService } from '../services/ProdutoService';
import type { ProdutoSemCusto, SugestaoDePreco } from '../services/ProdutoService';
import { ProdutoRepository } from '../repositories/ProdutoRepository';
import { CotacaoClient } from '../api/CotacaoClient';

export function registrarProdutosIpc(router: IpcRouter): void {
  const service = new ProdutoService(new ProdutoRepository(), new CotacaoClient());

  router.registrar<void, Produto[] | ProdutoSemCusto[]>(
    'produtos:listar',
    ['ADMIN', 'ATENDENTE'],
    (_dados, usuario) => service.listar(usuario!.perfil),
  );
  router.registrar<Partial<Produto>, number>('produtos:salvar', ['ADMIN'], (dados) =>
    service.salvar(dados),
  );
  router.registrar<number, void>('produtos:excluir', ['ADMIN'], (id) =>
    service.excluir(id),
  );
  // Botão "Calcular preço": só SUGERE, não salva nada
  router.registrar<Partial<Produto>, SugestaoDePreco>('produtos:cotacao', ['ADMIN'], (dados) =>
    service.sugerirPreco(dados),
  );
}
