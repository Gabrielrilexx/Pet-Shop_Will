// =====================================================================
// tipos.ts — O "DICIONÁRIO" DO SISTEMA
// ---------------------------------------------------------------------
// Aqui ficam os formatos dos dados que circulam entre o banco, o Main
// e a tela. Os nomes dos campos são EXATAMENTE os nomes das colunas
// do MySQL (snake_case), para que uma linha do SELECT já "encaixe" na
// interface sem precisar converter nada.
//
// Arquivo compartilhado: cada integrante só ACRESCENTA o que é dele,
// nunca muda o que já existe sem combinar com o grupo.
// =====================================================================

// ---------------------------------------------------------------------
// Tipos gerais
// ---------------------------------------------------------------------

/** Os dois perfis de acesso do sistema. */
export type Perfil = 'ADMIN' | 'ATENDENTE';

/**
 * Formato de TODA resposta que o Main devolve para a tela.
 * Ou deu certo (ok: true, com os dados), ou deu errado (ok: false,
 * com a mensagem de erro). Nunca as duas coisas ao mesmo tempo.
 */
export type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

// Valores possíveis das colunas ENUM do banco
export type MoedaCusto = 'BRL' | 'USD';
export type StatusPedido =
  | 'ABERTO'
  | 'CONFIRMADO'
  | 'EM_ROTA'
  | 'ENTREGUE'
  | 'CANCELADO';
export type StatusEntrega = 'EM_ROTA' | 'ENTREGUE' | 'NAO_ENTREGUE';

// ---------------------------------------------------------------------
// Uma interface por tabela (10 tabelas)
// ---------------------------------------------------------------------
// Convenções:
//   - VARCHAR, CHAR, TEXT ............ string
//   - INT, DECIMAL .................... number (o pool usa decimalNumbers)
//   - BOOLEAN ......................... boolean
//   - DATETIME ........................ Date
//   - coluna que aceita NULL .......... tipo | null
//   - coluna que o BANCO preenche
//     sozinho (DEFAULT CURRENT_TIMESTAMP) é opcional (?), porque na
//     hora de inserir ninguém precisa mandar esse valor.
// ---------------------------------------------------------------------

/** Tabela usuario — Integrante 1 */
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  perfil: Perfil;
  ativo: boolean;
  criado_em?: Date;
}

/**
 * Usuário do jeito que pode ir para a TELA: igual ao Usuario, mas SEM
 * o campo senha_hash. ("Omit" = "copie o tipo, menos este campo".)
 */
export type UsuarioSemSenha = Omit<Usuario, 'senha_hash'>;

/** Tabela cliente — Integrante 2 */
export interface Cliente {
  id: number;
  nome: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  distancia_km: number | null;
}

/** Tabela especie — Integrante 3 */
export interface Especie {
  id: number;
  nome: string;
}

/** Tabela categoria — Integrante 3 */
export interface Categoria {
  id: number;
  nome: string;
}

/** Tabela fornecedor — Integrante 3 */
export interface Fornecedor {
  id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  importado: boolean;
}

/** Tabela produto — Integrante 3 */
export interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  categoria_id: number;
  especie_id: number;
  fornecedor_id: number | null;
  moeda_custo: MoedaCusto;
  custo: number;
  margem_percentual: number;
  preco_venda: number;
  quantidade_estoque: number;
  estoque_minimo: number;
}

/** Tabela entregador — Integrante 2 */
export interface Entregador {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  placa_moto: string;
  valor_por_km: number;
  ativo: boolean;
}

/** Tabela pedido — Integrante 4 */
export interface Pedido {
  id: number;
  cliente_id: number;
  usuario_id: number;
  data_pedido?: Date;
  status: StatusPedido;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  observacao: string | null;
}

/** Tabela item_pedido — Integrante 4 */
export interface ItemPedido {
  id: number;
  pedido_id: number;
  produto_id: number;
  quantidade: number;
  preco_unitario: number;
}

/** Tabela entrega — Integrante 4 */
export interface Entrega {
  id: number;
  pedido_id: number;
  entregador_id: number;
  distancia_km: number;
  valor_entrega: number;
  status: StatusEntrega;
  saiu_em: Date;
  entregue_em: Date | null;
  observacao: string | null;
}
