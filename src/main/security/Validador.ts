// =====================================================================
// Validador.ts — o "PORTEIRO" dos dados que chegam da tela
// ---------------------------------------------------------------------
// Tudo o que vem da tela é conferido AQUI, no Main, antes de chegar ao
// banco. A validação feita na tela é só conforto para o usuário: ela
// pode ser burlada. A do Main não.
//
// Como usar: os métodos são "static", então não precisa de "new".
// Se o valor estiver errado, o método LANÇA um ErroDeNegocio com uma
// mensagem pronta para a tela. Se estiver certo, DEVOLVE o valor já
// limpo, para você usar direto:
//
//     const cep  = Validador.cep(dados.cep);          // '13480000'
//     const nome = Validador.obrigatorio(dados.nome, 'Nome');
//     Validador.tamanhoMaximo(nome, 100, 'Nome');
// =====================================================================

import { ErroDeNegocio } from './ErroDeNegocio';

export class Validador {
  /**
   * Tira tudo o que não for número. Não lança erro.
   * Ex.: '123.456.789-09' -> '12345678909'
   */
  static somenteDigitos(v: unknown): string {
    return String(v ?? '').replace(/\D/g, '');
  }

  /** Não pode ser vazio (nem só espaços). Devolve o texto sem espaços nas pontas. */
  static obrigatorio(v: unknown, campo: string): string {
    const texto = String(v ?? '').trim();
    if (texto === '') {
      throw new ErroDeNegocio(`O campo ${campo} é obrigatório.`);
    }
    return texto;
  }

  /** Confere o tamanho máximo (igual ao VARCHAR da coluna). Vazio passa. */
  static tamanhoMaximo(v: unknown, max: number, campo: string): string {
    const texto = String(v ?? '').trim();
    if (texto.length > max) {
      throw new ErroDeNegocio(
        `O campo ${campo} deve ter no máximo ${max} caracteres.`,
      );
    }
    return texto;
  }

  /** E-mail no formato algo@algo.algo. Devolve em minúsculas. */
  static email(v: unknown): string {
    const texto = String(v ?? '').trim().toLowerCase();
    // [^\s@]+ = "um ou mais caracteres que não sejam espaço nem @"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
      throw new ErroDeNegocio('E-mail inválido.');
    }
    return texto;
  }

  /** CEP com 8 números (aceita com ou sem traço). Devolve só os números. */
  static cep(v: unknown): string {
    const digitos = Validador.somenteDigitos(v);
    if (digitos.length !== 8) {
      throw new ErroDeNegocio('CEP inválido. Ele deve ter 8 números.');
    }
    return digitos;
  }

  /** CPF com dígito verificador. Devolve só os 11 números. */
  static cpf(v: unknown): string {
    const cpf = Validador.somenteDigitos(v);

    // 11 números e não pode ser tudo igual (111.111.111-11 passa na conta,
    // mas não é um CPF de verdade)
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      throw new ErroDeNegocio('CPF inválido.');
    }

    // Os 2 últimos números são calculados a partir dos 9 primeiros.
    const digito1 = Validador.calcularDigito(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digito2 = Validador.calcularDigito(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

    if (digito1 !== Number(cpf[9]) || digito2 !== Number(cpf[10])) {
      throw new ErroDeNegocio('CPF inválido.');
    }
    return cpf;
  }

  /** CNPJ com dígito verificador. Devolve só os 14 números. */
  static cnpj(v: unknown): string {
    const cnpj = Validador.somenteDigitos(v);

    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
      throw new ErroDeNegocio('CNPJ inválido.');
    }

    const digito1 = Validador.calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digito2 = Validador.calcularDigito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    if (digito1 !== Number(cnpj[12]) || digito2 !== Number(cnpj[13])) {
      throw new ErroDeNegocio('CNPJ inválido.');
    }
    return cnpj;
  }

  /**
   * Senha nova (cadastro, seed e redefinição): mínimo de 8 caracteres,
   * com pelo menos uma letra e um número. Devolve a senha SEM mexer nos
   * espaços (espaço também é caractere de senha).
   * Máximo de 72 bytes porque o bcrypt ignora o que passa disso.
   */
  static senha(v: unknown): string {
    const senha = String(v ?? '');
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
      throw new ErroDeNegocio(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }
    if (new TextEncoder().encode(senha).length > 72) {
      throw new ErroDeNegocio('A senha é longa demais (máximo de 72 caracteres).');
    }
    return senha;
  }

  /** Número maior que zero (ex.: quantidade, preço). Devolve como number. */
  static positivo(n: unknown, campo: string): number {
    const numero = Validador.paraNumero(n, campo);
    if (numero <= 0) {
      throw new ErroDeNegocio(`O campo ${campo} deve ser maior que zero.`);
    }
    return numero;
  }

  /** Número zero ou maior (ex.: estoque). Devolve como number. */
  static naoNegativo(n: unknown, campo: string): number {
    const numero = Validador.paraNumero(n, campo);
    if (numero < 0) {
      throw new ErroDeNegocio(`O campo ${campo} não pode ser negativo.`);
    }
    return numero;
  }

  // -------------------------------------------------------------------
  // Ajudantes internos (private: só o próprio Validador usa)
  // -------------------------------------------------------------------

  /**
   * Conta do dígito verificador (mesma regra para CPF e CNPJ):
   * multiplica cada número pelo seu peso, soma tudo e pega o resto
   * da divisão por 11. Resto menor que 2 -> dígito 0; senão 11 - resto.
   */
  private static calcularDigito(numeros: string, pesos: number[]): number {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(numeros[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  /** Converte para número e recusa texto vazio ou que não é número. */
  private static paraNumero(n: unknown, campo: string): number {
    const numero = typeof n === 'string' ? Number(n.replace(',', '.')) : Number(n);
    if (n === null || n === undefined || n === '' || !Number.isFinite(numero)) {
      throw new ErroDeNegocio(`O campo ${campo} deve ser um número.`);
    }
    return numero;
  }
}
