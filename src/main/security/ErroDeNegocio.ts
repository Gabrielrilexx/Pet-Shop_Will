// =====================================================================
// ErroDeNegocio.ts — um erro que PODE ser mostrado na tela
// ---------------------------------------------------------------------
// Existem dois tipos de erro no sistema:
//
//   1. ErroDeNegocio: uma regra foi quebrada e o usuário precisa saber.
//      Ex.: "O campo Nome é obrigatório.", "CPF inválido."
//      -> a mensagem vai para a tela do jeito que está.
//
//   2. Qualquer outro erro (Error comum): algo quebrou por dentro.
//      Ex.: queda do banco, erro de digitação no SQL.
//      -> a tela só recebe "Erro inesperado"; o detalhe fica no console.
//         Assim não mostramos nomes de tabelas, colunas ou do servidor
//         para quem está usando o sistema (isso ajudaria um atacante).
//
// Quem faz essa separação é o IpcRouter (Passo 6), usando "instanceof".
// =====================================================================

export class ErroDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem); // guarda a mensagem do jeito que o Error já faz
    this.name = 'ErroDeNegocio'; // nome que aparece no console
  }
}
