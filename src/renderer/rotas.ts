// =====================================================================
// rotas.ts — o "MAPA" do menu
// ---------------------------------------------------------------------
// Cada linha da lista ROTAS vira um item no menu do topo. Clicou no
// item, o renderer.ts cria a página e chama render(app).
//
// ARQUIVO COMPARTILHADO: cada integrante só ACRESCENTA as linhas da
// sua parte, na sua seção (o import e a rota).
// =====================================================================

import type { Perfil } from '../shared/tipos';

// --- Integrante 1 ----------------------------------------------------
import { UsuariosPage } from './pages/UsuariosPage';
// --- Integrante 2 ----------------------------------------------------
import { ClientesPage } from './pages/ClientesPage';
import { EntregadoresPage } from './pages/EntregadoresPage';
// --- Integrante 3 ----------------------------------------------------
import { CatalogoPage } from './pages/CatalogoPage';
import { FornecedoresPage } from './pages/FornecedoresPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { InicioPage } from './pages/InicioPage';
// --- Integrante 4 ----------------------------------------------------
import { PedidosPage } from './pages/PedidosPage';
/** O que toda página precisa ter (contrato da Arquitetura). */
export interface Pagina {
  render(app: HTMLElement): Promise<void>;
}

/** Um item do menu. */
export interface Rota {
  id: string; // aparece no endereço (#usuarios); só letras minúsculas
  titulo: string; // texto do menu
  perfis: Perfil[]; // quem vê o item no menu (Passo 10 esconde dos outros)
  criar: () => Pagina; // como criar a página quando o item é clicado
}

export const ROTAS: Rota[] = [
  // --- Integrante 1 --------------------------------------------------
  { id: 'usuarios', titulo: 'Usuários', perfis: ['ADMIN'], criar: () => new UsuariosPage() },
  // --- Integrante 2 --------------------------------------------------
  { id: 'clientes', titulo: 'Clientes', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new ClientesPage() },
  { id: 'entregadores', titulo: 'Entregadores', perfis: ['ADMIN'], criar: () => new EntregadoresPage() },
  // --- Integrante 3 --------------------------------------------------
  { id: 'catalogo', titulo: 'Catálogo', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new CatalogoPage() },
  { id: 'fornecedores', titulo: 'Fornecedores', perfis: ['ADMIN'], criar: () => new FornecedoresPage() },
  { id: 'produtos', titulo: 'Produtos', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new ProdutosPage() },
  { id: 'inicio', titulo: 'Início', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new InicioPage() },
  // --- Integrante 4 --------------------------------------------------
  { id: 'pedidos', titulo: 'Pedidos', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new PedidosPage() },
];
