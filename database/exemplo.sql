-- =====================================================================
-- exemplo.sql — O "ESTOQUE DE AMOSTRA" PARA TESTAR O SISTEMA
-- ---------------------------------------------------------------------
-- O schema.sql construiu as prateleiras vazias. Este script coloca
-- algumas mercadorias de amostra nelas, como a vitrine de uma loja
-- antes da inauguração. Assim cada integrante consegue testar a sua
-- parte sem esperar as telas dos colegas ficarem prontas.
--
-- O que entra (tudo fictício, menos as ruas e CEPs de Limeira):
--   - 5 espécies e 5 categorias
--   - 3 fornecedores (2 nacionais e 1 importado)
--   - 9 produtos: 2 com custo em DÓLAR e 2 com ESTOQUE BAIXO
--     (um deles zerado, para testar pedido sem estoque)
--   - 4 clientes: 3 com distância e 1 SEM distância (API falhou)
--   - 3 entregadores: 2 ativos e 1 INATIVO
--
-- O que NÃO entra, de propósito:
--   - usuários: o primeiro ADMIN é criado pelo "npm run seed" do
--     Integrante 1, com a senha digitada na hora (nunca no SQL);
--   - pedidos: todo pedido precisa de um usuario_id, então só depois
--     do seed.
--
-- COMO RODAR (MySQL Workbench), DEPOIS do schema.sql:
--   1. File -> Open SQL Script -> database/exemplo.sql
--   2. Clique no raio simples (executa o script inteiro).
--
-- RODAR DUAS VEZES? O script PARA logo no primeiro INSERT, com o erro
-- "Duplicate entry 'Cachorro'", porque o nome da espécie é UNIQUE.
-- Nada é duplicado nem apagado.
--
-- CPF e CNPJ: números fictícios, mas com dígito verificador correto,
-- para passarem no Validador quando alguém editar pela tela.
--
-- Autor: Integrante 4 (banco, pedidos e entregas)
-- =====================================================================

SET NAMES utf8mb4;
USE cl203240;


-- ---------------------------------------------------------------------
-- 1. ESPÉCIES (primeiro de tudo: é a "trava" contra rodar duas vezes)
-- ---------------------------------------------------------------------
INSERT INTO especie (nome) VALUES
  ('Cachorro'),
  ('Gato'),
  ('Peixe'),
  ('Pássaro'),
  ('Roedor');

-- ---------------------------------------------------------------------
-- 2. CATEGORIAS
-- ---------------------------------------------------------------------
INSERT INTO categoria (nome) VALUES
  ('Ração'),
  ('Brinquedo'),
  ('Acessório'),
  ('Medicamento'),
  ('Higiene');

-- ---------------------------------------------------------------------
-- 3. FORNECEDORES
-- CNPJs fictícios com dígito verificador correto. Por serem
-- fictícios, a BrasilAPI responde "não encontrado" para eles: para
-- testar a busca de CNPJ, use um CNPJ real (o PDF sugere 19131243000197).
-- ---------------------------------------------------------------------
INSERT INTO fornecedor
  (cnpj, razao_social, nome_fantasia, telefone, cidade, uf, importado)
VALUES
  ('11222333000181', 'Nutri Pet Distribuidora Ltda',          'Nutri Pet',    '(19) 3400-0001', 'Limeira',   'SP', FALSE),
  ('12345678000195', 'Brinca Bicho Comércio de Brinquedos Ltda', 'Brinca Bicho', '(19) 3400-0002', 'Campinas',  'SP', FALSE),
  ('98765432000198', 'Global Vet Importadora Ltda',           'Global Vet',   '(11) 3000-0003', 'São Paulo', 'SP', TRUE);

-- ---------------------------------------------------------------------
-- 4. PRODUTOS
-- Atenção ao jeito de ligar o produto à categoria, à espécie e ao
-- fornecedor: em vez de escrever o número do id (1, 2, 3...), o
-- script PERGUNTA o id pelo nome, com um SELECT entre parênteses.
-- Motivo: o banco é compartilhado. Se um colega já tiver cadastrado
-- alguma categoria de teste, a "Ração" pode não ser o id 1, e um
-- número fixo ligaria o produto à categoria errada.
--
-- Estoque baixo = quantidade_estoque MENOR que estoque_minimo.
-- Produtos em USD: o preco_venda (sempre em reais) foi calculado com
-- um dólar de R$ 5,40 e margem de 40%, como o ADMIN faria na tela.
-- ---------------------------------------------------------------------
INSERT INTO produto
  (nome, descricao, categoria_id, especie_id, fornecedor_id,
   moeda_custo, custo, margem_percentual, preco_venda,
   quantidade_estoque, estoque_minimo)
VALUES
  -- Produtos normais (estoque acima do mínimo)
  ('Ração Premium Cão Adulto 15kg', 'Ração seca para cães adultos de porte médio',
    (SELECT id FROM categoria  WHERE nome = 'Ração'),
    (SELECT id FROM especie    WHERE nome = 'Cachorro'),
    (SELECT id FROM fornecedor WHERE cnpj = '11222333000181'),
    'BRL', 150.00, 30, 195.00, 20, 5),

  ('Ração Gato Castrado 10kg', 'Ração seca para gatos castrados',
    (SELECT id FROM categoria  WHERE nome = 'Ração'),
    (SELECT id FROM especie    WHERE nome = 'Gato'),
    (SELECT id FROM fornecedor WHERE cnpj = '11222333000181'),
    'BRL', 120.00, 30, 156.00, 15, 5),

  ('Alpiste 500g', NULL,
    (SELECT id FROM categoria  WHERE nome = 'Ração'),
    (SELECT id FROM especie    WHERE nome = 'Pássaro'),
    (SELECT id FROM fornecedor WHERE cnpj = '11222333000181'),
    'BRL', 7.00, 40, 9.80, 30, 10),

  ('Bolinha de Borracha', 'Brinquedo resistente para cães',
    (SELECT id FROM categoria  WHERE nome = 'Brinquedo'),
    (SELECT id FROM especie    WHERE nome = 'Cachorro'),
    (SELECT id FROM fornecedor WHERE cnpj = '12345678000195'),
    'BRL', 6.00, 60, 9.60, 40, 10),

  -- Produto SEM fornecedor (fornecedor_id aceita NULL)
  ('Coleira Ajustável M', NULL,
    (SELECT id FROM categoria  WHERE nome = 'Acessório'),
    (SELECT id FROM especie    WHERE nome = 'Cachorro'),
    NULL,
    'BRL', 15.00, 50, 22.50, 25, 5),

  -- ESTOQUE BAIXO 1: tem 3, o mínimo é 10
  ('Ração para Peixes Tropicais 50g', NULL,
    (SELECT id FROM categoria  WHERE nome = 'Ração'),
    (SELECT id FROM especie    WHERE nome = 'Peixe'),
    (SELECT id FROM fornecedor WHERE cnpj = '11222333000181'),
    'BRL', 8.00, 50, 12.00, 3, 10),

  -- ESTOQUE BAIXO 2: ZERADO (bom para testar a confirmação de um
  -- pedido em que só o último item está sem estoque)
  ('Arranhador para Gatos', 'Arranhador de sisal com base',
    (SELECT id FROM categoria  WHERE nome = 'Brinquedo'),
    (SELECT id FROM especie    WHERE nome = 'Gato'),
    (SELECT id FROM fornecedor WHERE cnpj = '12345678000195'),
    'BRL', 45.00, 40, 63.00, 0, 2),

  -- EM DÓLAR 1: custo US$ 12,50 -> R$ 67,50 -> x 1,40 = R$ 94,50
  ('Antipulgas Importado (cães)', 'Pipeta antipulgas importada',
    (SELECT id FROM categoria  WHERE nome = 'Medicamento'),
    (SELECT id FROM especie    WHERE nome = 'Cachorro'),
    (SELECT id FROM fornecedor WHERE cnpj = '98765432000198'),
    'USD', 12.50, 40, 94.50, 12, 4),

  -- EM DÓLAR 2: custo US$ 8,90 -> R$ 48,06 -> x 1,40 = R$ 67,28 (~67,30)
  ('Vermífugo Importado (gatos)', 'Comprimido vermífugo importado',
    (SELECT id FROM categoria  WHERE nome = 'Medicamento'),
    (SELECT id FROM especie    WHERE nome = 'Gato'),
    (SELECT id FROM fornecedor WHERE cnpj = '98765432000198'),
    'USD', 8.90, 40, 67.30, 8, 3);

-- ---------------------------------------------------------------------
-- 5. CLIENTES
-- Nomes e telefones fictícios; ruas e CEPs reais do Centro de Limeira,
-- para o "Buscar CEP" (ViaCEP) do Integrante 2 funcionar nos testes.
-- distancia_km: valor APROXIMADO até a loja, só para testar a taxa de
-- entrega. latitude/longitude ficam NULL: não inventamos coordenadas;
-- o Integrante 2 recalcula tudo quando o endereço for salvo pela tela.
-- O último cliente fica SEM distância, simulando a API de mapas fora
-- do ar (o pedido dele deve avisar que falta a distância).
-- ---------------------------------------------------------------------
INSERT INTO cliente
  (nome, telefone, cep, logradouro, numero, complemento,
   bairro, cidade, uf, latitude, longitude, distancia_km)
VALUES
  ('Ana Souza',    '(19) 90000-0001', '13480001', 'Rua Senador Vergueiro', '120', NULL,
   'Centro', 'Limeira', 'SP', NULL, NULL, 2.10),
  ('Bruno Lima',   '(19) 90000-0002', '13480010', 'Rua Carlos Gomes',      '455', 'Apto 12',
   'Centro', 'Limeira', 'SP', NULL, NULL, 1.40),
  ('Carla Mendes', '(19) 90000-0003', '13480210', 'Rua Barão de Campinas', '300', NULL,
   'Centro', 'Limeira', 'SP', NULL, NULL, 2.80),
  ('Diego Rocha',  '(19) 90000-0004', '13480040', 'Rua Santa Cruz',        '88',  'Casa 2',
   'Centro', 'Limeira', 'SP', NULL, NULL, NULL);

-- ---------------------------------------------------------------------
-- 6. ENTREGADORES
-- CPFs fictícios com dígito verificador correto. O último está
-- INATIVO: não pode aparecer na lista de saída para entrega.
-- ---------------------------------------------------------------------
INSERT INTO entregador
  (nome, cpf, telefone, placa_moto, valor_por_km, ativo)
VALUES
  ('João Pereira', '12345678909', '(19) 90000-1001', 'ABC1D23', 2.00, TRUE),
  ('Marcos Silva', '98765432100', '(19) 90000-1002', 'DEF4G56', 2.50, TRUE),
  ('Paulo Santos', '11144477735', '(19) 90000-1003', 'GHI7J89', 2.20, FALSE);

-- =====================================================================
-- Fim. Esperado: 5 espécies, 5 categorias, 3 fornecedores,
-- 9 produtos, 4 clientes e 3 entregadores.
-- =====================================================================