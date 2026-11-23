// =====================================================================
// canais.ts — O "CARDÁPIO" DO SISTEMA
// ---------------------------------------------------------------------
// Lista de TODOS os canais IPC que a tela tem permissão de chamar.
// O preload confere esta lista: se a tela pedir um canal que não está
// aqui, o pedido é recusado antes mesmo de chegar ao Main.
//
// Formato do nome: 'modulo:acao'  (ex.: 'clientes:listar')
// "salvar" = insere quando não tem id, atualiza quando tem.
//
// REGRA DO GRUPO: cada integrante só acrescenta linhas na SUA seção.
// Assim, quando dois colegas mexem neste arquivo ao mesmo tempo, cada
// um altera um trecho diferente e o Git consegue juntar sem conflito.
// =====================================================================

export const CANAIS_PERMITIDOS: readonly string[] = [
  // --- Integrante 1: login e usuários ---------------------------------
  'auth:login',
  'auth:sair',
  'auth:atual',
  'usuarios:listar',
  'usuarios:salvar',
  'usuarios:excluir',
  'usuarios:alterarAtivo',
  'usuarios:redefinirSenha',

  // --- Integrante 2: clientes e entregadores --------------------------
  'clientes:listar',
  'clientes:salvar',
  'clientes:excluir',
  'clientes:buscarCep',

  // --- Integrante 3: espécies, categorias, fornecedores, produtos e início
  'especies:listar',
  'especies:salvar',
  'especies:excluir',
  'categorias:listar',
  'categorias:salvar',
  'categorias:excluir',
  'fornecedores:listar',
  'fornecedores:salvar',
  'fornecedores:excluir',
  'fornecedores:buscarCnpj',
  'produtos:listar',
  'produtos:salvar',
  'produtos:excluir',
  'produtos:cotacao',
  'inicio:resumo',

  // --- Integrante 4: pedidos, itens e entregas -------------------------
];
