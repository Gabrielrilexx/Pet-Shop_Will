-- =====================================================================
-- schema.sql — A "PLANTA DA DESPENSA" DO SISTEMA (10 tabelas)
-- ---------------------------------------------------------------------
-- Este script constrói as prateleiras onde o sistema guarda tudo:
-- usuários, clientes, catálogo, pedidos e entregas. Pense numa obra:
-- primeiro levantamos os prédios que não dependem de ninguém (andar 1),
-- depois os que apontam para eles (andar 2) e por último os que
-- apontam para o andar 2 (andar 3). Se a ordem for trocada, o MySQL
-- recusa a chave estrangeira, como um porteiro que não aceita entrega
-- para um prédio que ainda não existe.
--
-- COMO RODAR (MySQL Workbench):
--   1. Abra este arquivo (File -> Open SQL Script).
--   2. Clique no raio simples (executa o script inteiro).
--   3. Confira com:  SHOW TABLES;   (devem aparecer as 10 tabelas)
--
-- ATENÇÃO, BANCO COMPARTILHADO:
--   - Este script NÃO tem DROP TABLE de propósito: ele nunca apaga nada.
--   - Se for rodado de novo, ele PARA no primeiro CREATE TABLE com o
--     erro "Table 'usuario' already exists". Isso é esperado e não
--     estraga nada. Para recriar as tabelas, combine antes no grupo.
--   - Nomes de colunas IGUAIS aos de src/shared/tipos.ts. Mudou uma
--     coluna aqui? Avise o grupo e peça ao Integrante 1 para atualizar
--     o tipos.ts.
--
-- Autor: Integrante 4 (banco, pedidos e entregas)
-- =====================================================================

-- Garante que os acentos dos comentários e dos dados cheguem certos.
SET NAMES utf8mb4;

-- Escolhe o banco do grupo (conta do Caio no servidor da escola).
-- Sem esta linha, o MySQL responde "Error 1046: No database selected",
-- porque o servidor guarda vários bancos e não sabe em qual criar.
USE cl203240;


-- =====================================================================
-- ANDAR 1 — tabelas que NÃO apontam para nenhuma outra
-- =====================================================================

-- ---------------------------------------------------------------------
-- usuario: quem faz login no sistema (o dono e os funcionários).
-- A senha NUNCA é guardada: só o hash do bcrypt (senha_hash).
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL,
  senha_hash  VARCHAR(255) NOT NULL,
  perfil      ENUM('ADMIN', 'ATENDENTE') NOT NULL DEFAULT 'ATENDENTE',
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em   DATETIME     DEFAULT CURRENT_TIMESTAMP,  -- o banco preenche sozinho

  -- Dois usuários não podem ter o mesmo e-mail (é o "nome de login").
  CONSTRAINT uq_usuario_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- cliente: quem compra pelo WhatsApp. Sem CPF (minimização da LGPD).
-- latitude, longitude e distancia_km aceitam NULL: se a API de mapas
-- falhar, o cliente é salvo mesmo assim, sem distância (nunca um
-- número inventado, porque distância errada vira taxa errada).
-- ---------------------------------------------------------------------
CREATE TABLE cliente (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(100)  NOT NULL,
  telefone      VARCHAR(20)   NOT NULL,
  cep           CHAR(8)       NOT NULL,       -- só os 8 números, sem traço
  logradouro    VARCHAR(150)  NOT NULL,
  numero        VARCHAR(10)   NOT NULL,       -- texto: existe "120-A" e "S/N"
  complemento   VARCHAR(60)   NULL,
  bairro        VARCHAR(80)   NOT NULL,
  cidade        VARCHAR(80)   NOT NULL,
  uf            CHAR(2)       NOT NULL,
  latitude      DECIMAL(10,7) NULL,
  longitude     DECIMAL(10,7) NULL,
  distancia_km  DECIMAL(6,2)  NULL            -- calculada pelo Integrante 2
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- especie: cachorro, gato, peixe, pássaro...
-- ---------------------------------------------------------------------
CREATE TABLE especie (
  id    INT         AUTO_INCREMENT PRIMARY KEY,
  nome  VARCHAR(50) NOT NULL,

  CONSTRAINT uq_especie_nome UNIQUE (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- categoria: ração, brinquedo, acessório, medicamento...
-- ---------------------------------------------------------------------
CREATE TABLE categoria (
  id    INT         AUTO_INCREMENT PRIMARY KEY,
  nome  VARCHAR(50) NOT NULL,

  CONSTRAINT uq_categoria_nome UNIQUE (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- fornecedor: de quem a loja compra (nacional ou importado).
-- Os dados da empresa vêm da BrasilAPI pelo CNPJ (Integrante 3).
-- ---------------------------------------------------------------------
CREATE TABLE fornecedor (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  cnpj           CHAR(14)     NOT NULL,       -- só os 14 números
  razao_social   VARCHAR(150) NOT NULL,
  nome_fantasia  VARCHAR(150) NULL,
  telefone       VARCHAR(20)  NULL,
  cidade         VARCHAR(80)  NULL,
  uf             CHAR(2)      NULL,
  importado      BOOLEAN      NOT NULL DEFAULT FALSE,

  CONSTRAINT uq_fornecedor_cnpj UNIQUE (cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- entregador: motoboys contratados pela loja.
-- CPF é dado sensível: na tela aparece mascarado e só para o ADMIN.
-- "ativo = FALSE" esconde o entregador da lista de saída, mas o
-- histórico das entregas dele continua guardado.
-- ---------------------------------------------------------------------
CREATE TABLE entregador (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(100) NOT NULL,
  cpf           CHAR(11)     NOT NULL,        -- só os 11 números
  telefone      VARCHAR(20)  NOT NULL,
  placa_moto    VARCHAR(8)   NOT NULL,
  valor_por_km  DECIMAL(6,2) NOT NULL,
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_entregador_cpf UNIQUE (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =====================================================================
-- ANDAR 2 — tabelas que apontam para o andar 1
-- =====================================================================

-- ---------------------------------------------------------------------
-- produto: o que a loja vende, com o estoque.
-- Aponta para categoria, especie e fornecedor (3 chaves estrangeiras).
-- fornecedor_id aceita NULL: nem todo produto tem fornecedor cadastrado.
-- Dinheiro sempre em DECIMAL (conta exata), nunca FLOAT (arredonda).
-- ---------------------------------------------------------------------
CREATE TABLE produto (
  id                  INT           AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(120)  NOT NULL,
  descricao           TEXT          NULL,
  categoria_id        INT           NOT NULL,
  especie_id          INT           NOT NULL,
  fornecedor_id       INT           NULL,
  moeda_custo         ENUM('BRL', 'USD') NOT NULL DEFAULT 'BRL',
  custo               DECIMAL(10,2) NOT NULL,  -- em reais OU em dólar (ver moeda_custo)
  margem_percentual   DECIMAL(5,2)  NOT NULL DEFAULT 30,
  preco_venda         DECIMAL(10,2) NOT NULL,  -- sempre em reais; quem decide é o ADMIN
  quantidade_estoque  INT           NOT NULL DEFAULT 0,
  estoque_minimo      INT           NOT NULL DEFAULT 0,

  -- RESTRICT: não deixa apagar uma categoria/espécie/fornecedor que
  -- ainda tem produtos ligados a ela.
  CONSTRAINT fk_produto_categoria
    FOREIGN KEY (categoria_id)  REFERENCES categoria (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_produto_especie
    FOREIGN KEY (especie_id)    REFERENCES especie (id)    ON DELETE RESTRICT,
  CONSTRAINT fk_produto_fornecedor
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedor (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- pedido: um pedido que chegou pelo WhatsApp.
-- Aponta para quem pediu (cliente) e para quem registrou (usuario).
-- Fluxo: ABERTO -> CONFIRMADO -> EM_ROTA -> ENTREGUE
--        (CANCELADO só a partir de ABERTO ou CONFIRMADO)
-- Obs.: NAO_ENTREGUE não existe aqui de propósito. Ele é status da
-- ENTREGA; quando a entrega falha, o pedido volta para CONFIRMADO.
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  cliente_id    INT           NOT NULL,
  usuario_id    INT           NOT NULL,       -- quem registrou o pedido
  data_pedido   DATETIME      DEFAULT CURRENT_TIMESTAMP,  -- o banco preenche sozinho
  status        ENUM('ABERTO', 'CONFIRMADO', 'EM_ROTA', 'ENTREGUE', 'CANCELADO')
                              NOT NULL DEFAULT 'ABERTO',
  subtotal      DECIMAL(10,2) NOT NULL DEFAULT 0,  -- soma dos itens
  taxa_entrega  DECIMAL(10,2) NOT NULL DEFAULT 0,  -- distancia_km x valor_por_km
  total         DECIMAL(10,2) NOT NULL DEFAULT 0,  -- subtotal + taxa_entrega
  observacao    VARCHAR(255)  NULL,

  -- RESTRICT: um cliente (ou usuário) com pedidos não pode ser apagado,
  -- para o histórico de vendas nunca sumir.
  CONSTRAINT fk_pedido_cliente
    FOREIGN KEY (cliente_id) REFERENCES cliente (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pedido_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =====================================================================
-- ANDAR 3 — tabelas que apontam para o andar 2
-- =====================================================================

-- ---------------------------------------------------------------------
-- item_pedido: cada produto dentro de um pedido.
-- Existe porque um pedido tem vários produtos e um produto aparece em
-- vários pedidos (relação "muitos para muitos"): a tabela do meio
-- resolve isso.
-- preco_unitario guarda o preço DO MOMENTO DA VENDA: se o produto
-- ficar mais caro amanhã, o pedido antigo continua com o valor certo.
-- ---------------------------------------------------------------------
CREATE TABLE item_pedido (
  id              INT           AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT           NOT NULL,
  produto_id      INT           NOT NULL,
  quantidade      INT           NOT NULL,
  preco_unitario  DECIMAL(10,2) NOT NULL,

  -- Ninguém compra "zero rações". O banco recusa quantidade 0 ou
  -- negativa (funciona de verdade a partir do MySQL 8.0.16).
  CONSTRAINT ck_item_pedido_quantidade CHECK (quantidade > 0),

  -- CASCADE (a única exceção do banco): apagou o pedido, os itens dele
  -- vão junto, porque item sem pedido não faz sentido.
  CONSTRAINT fk_item_pedido_pedido
    FOREIGN KEY (pedido_id)  REFERENCES pedido (id)  ON DELETE CASCADE,
  -- RESTRICT: um produto que já foi vendido não pode ser apagado.
  CONSTRAINT fk_item_pedido_produto
    FOREIGN KEY (produto_id) REFERENCES produto (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- entrega: cada saída de um pedido com um motoboy.
-- pedido_id NÃO é UNIQUE de propósito: se o cliente não estava em casa
-- (NAO_ENTREGUE), o pedido sai de novo com uma NOVA entrega, e as
-- tentativas antigas ficam no histórico.
-- distancia_km é copiada do cliente na hora da saída: se o endereço
-- mudar depois, a entrega antiga continua com a distância que valeu.
-- ---------------------------------------------------------------------
CREATE TABLE entrega (
  id             INT           AUTO_INCREMENT PRIMARY KEY,
  pedido_id      INT           NOT NULL,
  entregador_id  INT           NOT NULL,
  distancia_km   DECIMAL(6,2)  NOT NULL,
  valor_entrega  DECIMAL(10,2) NOT NULL,      -- distancia_km x valor_por_km
  status         ENUM('EM_ROTA', 'ENTREGUE', 'NAO_ENTREGUE')
                               NOT NULL DEFAULT 'EM_ROTA',
  saiu_em        DATETIME      NOT NULL,
  entregue_em    DATETIME      NULL,          -- vazio até o motoboy avisar
  observacao     VARCHAR(255)  NULL,

  CONSTRAINT fk_entrega_pedido
    FOREIGN KEY (pedido_id)     REFERENCES pedido (id)     ON DELETE RESTRICT,
  CONSTRAINT fk_entrega_entregador
    FOREIGN KEY (entregador_id) REFERENCES entregador (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- Fim. Resultado esperado: 10 tabelas e 9 chaves estrangeiras.
-- =====================================================================