// =====================================================================
// PasswordHasher.ts — o "TRITURADOR DE SENHAS"
// ---------------------------------------------------------------------
// A senha NUNCA é guardada no banco. Guardamos o HASH dela: uma
// "impressão digital" calculada pelo bcrypt.
//
// Analogia do triturador de papel: dá para triturar a senha e comparar
// com o que está guardado ("esses pedacinhos batem?"), mas é
// impossível remontar a folha original a partir dos pedacinhos.
// Se alguém roubar o banco, leva só os pedacinhos.
//
// O bcrypt ainda tem dois truques:
//   - SAL: cada hash leva um tempero aleatório, então duas pessoas com
//     a mesma senha "123456" ficam com hashes DIFERENTES;
//   - CUSTO: calcular um hash é de propósito LENTO (custo 10 = 2^10
//     rodadas). Para o login, 0,1 s não faz diferença; para quem tenta
//     adivinhar bilhões de senhas, faz toda a diferença.
// =====================================================================

import bcrypt from 'bcryptjs';

/** Custo do bcrypt pedido na Arquitetura do projeto. */
const CUSTO = 10;

export class PasswordHasher {
  /** Transforma a senha em hash (para guardar no banco). */
  static gerar(senha: string): Promise<string> {
    return bcrypt.hash(senha, CUSTO);
  }

  /** Confere se a senha digitada "bate" com o hash guardado. */
  static conferir(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }
}
