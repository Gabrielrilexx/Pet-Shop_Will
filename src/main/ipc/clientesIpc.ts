// =====================================================================
// clientesIpc.ts — os canais de clientes
// ---------------------------------------------------------------------
// É o "cardápio" do garçom (IpcRouter) para o módulo de clientes: liga
// cada canal a um método do ClienteService e diz QUEM pode pedir.
//
// Aqui também é a "linha de montagem" do Service (injeção de
// dependência): criamos o repository e os 3 clientes de API e
// entregamos prontos para o ClienteService.
//
// Permissões (tabela do README):
//   clientes:listar, clientes:salvar, clientes:buscarCep -> ADMIN e ATENDENTE
//   clientes:excluir -> só ADMIN
//
// Não tem try/catch aqui de propósito: o IpcRouter já faz isso e devolve
// { ok: true, dados } ou { ok: false, erro } para a tela.
// =====================================================================

import type { Cliente } from '../../shared/tipos';
import type { IpcRouter } from './IpcRouter';
import { ClienteService } from '../services/ClienteService';
import type { ClienteSalvo } from '../services/ClienteService';
import { ClienteRepository } from '../repositories/ClienteRepository';
import { ViaCepClient } from '../api/ViaCepClient';
import type { EnderecoDoCep } from '../api/ViaCepClient';
import { GeocodificacaoClient } from '../api/GeocodificacaoClient';
import { RotaClient } from '../api/RotaClient';

export function registrarClientesIpc(router: IpcRouter): void {
  const service = new ClienteService(
    new ClienteRepository(),
    new ViaCepClient(),
    new GeocodificacaoClient(),
    new RotaClient(),
  );

  // Lista de clientes (também usada pelo Integrante 4 na tela de pedido)
  router.registrar<void, Cliente[]>('clientes:listar', ['ADMIN', 'ATENDENTE'], () =>
    service.listar(),
  );
  // Cadastrar (sem id) ou editar (com id). Devolve o id e um aviso, se houver.
  router.registrar<Partial<Cliente>, ClienteSalvo>(
    'clientes:salvar',
    ['ADMIN', 'ATENDENTE'],
    (dados) => service.salvar(dados),
  );
  // Só o dono exclui
  router.registrar<number, void>('clientes:excluir', ['ADMIN'], (id) =>
    service.excluir(id),
  );
  // Botão "Buscar CEP": devolve o endereço para a tela preencher (não salva)
  router.registrar<string, EnderecoDoCep>(
    'clientes:buscarCep',
    ['ADMIN', 'ATENDENTE'],
    (cep) => service.buscarCep(cep),
  );
}
