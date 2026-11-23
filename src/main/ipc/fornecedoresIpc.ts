// =====================================================================
// fornecedoresIpc.ts — os canais de fornecedores
// ---------------------------------------------------------------------
// Liga cada canal a um método do FornecedorService.
//
// Permissões (tabela da Arquitetura): fornecedores:* -> só ADMIN.
// =====================================================================

import type { Fornecedor } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { FornecedorService } from '../services/FornecedorService';
import { FornecedorRepository } from '../repositories/FornecedorRepository';
import { CnpjClient } from '../api/CnpjClient';

export function registrarFornecedoresIpc(router: IpcRouter): void {
  const service = new FornecedorService(new FornecedorRepository(), new CnpjClient());

  router.registrar<void, Fornecedor[]>('fornecedores:listar', ['ADMIN'], () =>
    service.listar(),
  );
  router.registrar<Partial<Fornecedor>, number>('fornecedores:salvar', ['ADMIN'], (dados) =>
    service.salvar(dados),
  );
  router.registrar<number, void>('fornecedores:excluir', ['ADMIN'], (id) =>
    service.excluir(id),
  );
  // Botão "Buscar CNPJ": devolve a ficha para a tela preencher (não salva)
  router.registrar<string, Omit<Fornecedor, 'id' | 'importado'>>(
    'fornecedores:buscarCnpj',
    ['ADMIN'],
    (cnpj) => service.buscarCnpj(cnpj),
  );
}
