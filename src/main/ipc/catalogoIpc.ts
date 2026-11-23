// =====================================================================
// catalogoIpc.ts — os canais de espécies e categorias
// ---------------------------------------------------------------------
// O "cardápio" do catálogo: liga cada canal (nome do pedido) a um
// método do CatalogoService, dizendo QUEM pode pedir. Quem confere
// login e perfil, e quem faz o try/catch, é o IpcRouter do Caio.
//
// Permissões (tabela da Arquitetura):
//   especies:listar, categorias:listar          -> ADMIN, ATENDENTE
//   especies:salvar/excluir, categorias:salvar/excluir -> ADMIN
//
// <E, S> = tipo da Entrada (o que a tela manda) e da Saída (o que volta).
// A entrada é só uma "promessa" da tela: quem CONFERE de verdade é o
// Service, com o Validador.
// =====================================================================

import type { Categoria, Especie } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { CatalogoService } from '../services/CatalogoService';
import { EspecieRepository } from '../repositories/EspecieRepository';
import { CategoriaRepository } from '../repositories/CategoriaRepository';

export function registrarCatalogoIpc(router: IpcRouter): void {
  // Injeção de dependência: aqui é onde as peças são "plugadas"
  const service = new CatalogoService(new EspecieRepository(), new CategoriaRepository());

  // --- Espécies ---
  router.registrar<void, Especie[]>('especies:listar', ['ADMIN', 'ATENDENTE'], () =>
    service.listarEspecies(),
  );
  router.registrar<Partial<Especie>, number>('especies:salvar', ['ADMIN'], (dados) =>
    service.salvarEspecie(dados),
  );
  router.registrar<number, void>('especies:excluir', ['ADMIN'], (id) =>
    service.excluirEspecie(id),
  );

  // --- Categorias ---
  router.registrar<void, Categoria[]>('categorias:listar', ['ADMIN', 'ATENDENTE'], () =>
    service.listarCategorias(),
  );
  router.registrar<Partial<Categoria>, number>('categorias:salvar', ['ADMIN'], (dados) =>
    service.salvarCategoria(dados),
  );
  router.registrar<number, void>('categorias:excluir', ['ADMIN'], (id) =>
    service.excluirCategoria(id),
  );
}
