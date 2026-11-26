# 🐾 Pet Shop DAD

Sistema desktop para um pet shop que **vende pelo WhatsApp** e **entrega com motoboys próprios**. A loja registra clientes, produtos e pedidos; o sistema calcula a taxa de entrega pela distância real até a casa do cliente e só confirma pedido que tem estoque.

Projeto final da disciplina **DAD (Desenvolvimento de Aplicações Desktop)**, feito em grupo de 4.

| Integrante | Nome | Módulo |
| --- | --- | --- |
| 1 | Caio Andrade Campos | Base, login e segurança (banco, IPC, janela segura, usuários) |
| 2 | João Henrique Allegre | Clientes e entregadores (CEP, distância) |
| 3 | Gabriel dos Santos | Catálogo e estoque (espécies, categorias, fornecedores, produtos, tela inicial) |
| 4 | Evaldo José de Souza | Banco, pedidos e entregas |

---

## Funcionalidades

- **Login** com dois perfis: ADMIN (dono) e ATENDENTE (funcionário).
- **Usuários:** cadastrar, editar, ativar/desativar e redefinir senha (só ADMIN).
- **Clientes:** o endereço se preenche pelo CEP e a distância até a loja é calculada sozinha.
- **Entregadores:** cadastro com CPF (protegido) e valor cobrado por km.
- **Catálogo:** espécies, categorias e fornecedores (dados da empresa pelo CNPJ).
- **Produtos:** produtos importados em dólar, com preço de venda sugerido pela cotação do dia.
- **Pedidos:** o pedido só é confirmado se houver estoque de todos os itens; cancelar devolve o estoque.
- **Entregas:** o pedido sai com um motoboy ativo e a taxa é calculada sozinha (distância × valor por km). Depois é marcado como entregue ou não entregue, e cada tentativa fica no histórico.
- **Tela inicial:** pedidos do dia por situação e produtos abaixo do estoque mínimo.

## Tecnologias

Electron (Forge 8 + Vite), TypeScript, MySQL (`mysql2`), Bootstrap 5, `bcryptjs`, `dotenv`.

---

## Requisitos do professor

| Requisito | Onde está |
| --- | --- |
| Banco relacional com no mínimo 6 tabelas ligadas por chave estrangeira | 10 tabelas e 9 chaves estrangeiras em `database/schema.sql` |
| CRUD completo de todas as entidades | Uma tela por módulo em `src/renderer/pages/`, com listar, criar, editar e excluir. Os itens do pedido são criados, editados e removidos dentro do pedido. A entrega não tem editar nem excluir de propósito: é histórico (veja **Pedidos e entregas**) |
| Consumo de API em 4 situações | ViaCEP, Nominatim + OSRM, AwesomeAPI e BrasilAPI (veja **As 4 APIs**) |
| Segurança justificada | Veja **Segurança: o que fizemos e por quê** |
| Lógica organizada em classes (POO) | Repositories, Services e ApiClients com herança (`BaseRepository`, `HttpClient`) |
| Electron com TypeScript, nenhum `.js` de lógica | Todo o código em `src/` é `.ts` |
| Entrega no GitHub com commits de todos | Histórico do repositório |

---

## Como rodar

**Pré-requisitos:** Node.js 18 ou mais novo e acesso ao servidor MySQL.

1. Clone o repositório e instale as dependências:
   ```
   npm install
   ```
2. Copie o `.env.example` para `.env` e preencha o usuário, a senha e o nome do banco. O `.env` nunca vai para o GitHub.
3. Confira a conexão, as 10 tabelas e o relógio do servidor:
   ```
   npm run db:testar
   ```
4. **Só se o banco estiver vazio:** rode no MySQL Workbench o `database/schema.sql` (cria as tabelas) e depois o `database/exemplo.sql` (dados de exemplo). O banco é compartilhado: combine com o grupo antes.
5. **Só na primeira vez:** crie o primeiro ADMIN. O script pergunta nome, e-mail e senha no terminal, e a senha não aparece enquanto você digita:
   ```
   npm run seed
   ```
6. Abra o sistema:
   ```
   npm start
   ```

| Comando | Para quê |
| --- | --- |
| `npm start` | Abre o sistema em modo de desenvolvimento |
| `npm run typecheck` | O TypeScript confere o projeto inteiro (sem mensagem = sem erros) |
| `npm run db:testar` | Check-up do banco: conexão, tabelas e relógio |
| `npm run seed` | Cria o primeiro ADMIN |
| `npm run make` | Gera o instalador do programa |

---

## Como o sistema é organizado

```
 Tela (renderer) ──window.api.chamar('modulo:acao')──▶ preload ──▶ IpcRouter ──▶ Service ──▶ Repository ──▶ Database ──▶ MySQL
                                                                                     │
                                                                                     └──▶ XxxClient ──▶ HttpClient ──▶ API na internet
```

| Camada | Papel (analogia do restaurante) | Onde |
| --- | --- | --- |
| Tela | O cliente no salão: pede, mas nunca entra na cozinha | `src/renderer/pages/` |
| preload | O balcão: só aceita pedidos do cardápio (`canais.ts`) | `src/preload.ts` |
| IpcRouter | O garçom: confere quem pede e se pode pedir | `src/main/ipc/IpcRouter.ts` |
| Services | A cozinha: as regras de negócio | `src/main/services/` |
| Repositories | O estoquista: o único que mexe no banco | `src/main/repositories/` |
| ApiClients | O fornecedor de fora: CEP, distância, dólar, CNPJ | `src/main/api/` |

---

## As 4 APIs

Todas gratuitas e sem cartão de crédito. Três atendem pedidos diretos do cliente; a quarta (CNPJ) foi ideia do grupo.

| # | Situação | API | Classe | Pedido do cliente |
| --- | --- | --- | --- | --- |
| 1 | Cadastro de cliente: digita o CEP e o endereço se preenche | ViaCEP | `ViaCepClient` | "Eu sempre pergunto o CEP do cliente" |
| 2 | Cadastro de cliente: distância da loja até a casa dele | Nominatim (endereço → coordenadas) + OSRM (rota → km) | `GeocodificacaoClient`, `RotaClient` | "O motoboy cobra por quilômetro" |
| 3 | Produto importado: custo em reais e preço sugerido | AwesomeAPI (USD-BRL) | `CotacaoClient` | "Quanto dá o dólar naquele dia" |
| 4 | Fornecedor: digita o CNPJ e os dados da empresa se preenchem | BrasilAPI | `CnpjClient` | Ideia nossa: "compro nacional e importado" |

**Por que não o Google Maps:** a API de distância do Google exige conta com cartão de crédito. O OpenStreetMap faz o mesmo de graça. Em troca, o Nominatim pede no máximo 1 consulta por segundo e um cabeçalho `User-Agent`; como a distância é calculada uma vez por cliente, isso não atrapalha.

**Regras que valem para as 4** (todas herdadas da classe `HttpClient`):
- A chamada acontece no **Main**, nunca na tela.
- Só **HTTPS**, com **tempo limite de 5 segundos**. Se a API cair, o sistema avisa e deixa preencher à mão: a loja não para porque um site caiu.
- A resposta é **conferida antes de salvar** (ex.: CEP inexistente). Se a distância não puder ser calculada, o cliente é salvo sem ela, nunca com um número inventado.
- Cada API tem a **própria classe**: se um dia trocar de API, só aquela classe muda.

---

## Pedidos e entregas

O caminho de um pedido:

```
ABERTO ──confirmar──▶ CONFIRMADO ──sair──▶ EM_ROTA ──entregue──▶ ENTREGUE
  │                     │    ▲                │
  │ cancelar   cancelar │    └─ não entregue ─┘
  ▼                     ▼
CANCELADO             CANCELADO
```

| Regra | Por quê |
| --- | --- |
| Confirmar baixa o estoque de **todos** os itens numa transação; se faltar um, nada é baixado | O estoque nunca fica pela metade |
| O preço de cada item é gravado no pedido, e quem registrou vem do usuário logado | Mudar o preço do produto depois não altera pedidos antigos, e ninguém registra pedido "em nome de outro" |
| Só sai para entrega um pedido CONFIRMADO, com um entregador **ativo** | Entregador desligado não aparece para novas entregas, mas o histórico dele continua |
| Taxa = distância do cliente × valor por km do entregador, calculada no Main | A taxa nunca vem da tela. Cliente sem distância calculada não sai: taxa errada é prejuízo |
| A distância é **copiada** para a entrega | Se o cliente mudar de endereço depois, a entrega antiga continua certa |
| Não entregue: o pedido volta para CONFIRMADO e a taxa zera | Pode sair de novo, e a próxima saída calcula a taxa do novo entregador |
| Só se edita pedido ABERTO, e só se exclui pedido ABERTO ou CANCELADO sem entregas | Pedido confirmado já mexeu no estoque, e pedido que saiu já tem entrega registrada |
| **A entrega não tem editar nem excluir** | Cada saída é um fato que aconteceu (quem levou, quando, quanto cobrou). Se desse para apagar ou mudar, daria para "sumir" com uma taxa já cobrada. Por isso a entrega só **muda de situação** (entregue ou não entregue) e o histórico mostra todas as tentativas |

---

## Banco de dados

10 tabelas (`database/schema.sql`): `usuario`, `cliente`, `especie`, `categoria`, `fornecedor`, `produto`, `entregador`, `pedido`, `item_pedido` e `entrega`.

| Decisão | Por quê |
| --- | --- |
| Chaves estrangeiras com `ON DELETE RESTRICT` | Não dá para apagar uma espécie usada por um produto, ou um cliente com pedidos: o histórico nunca fica com "buracos" |
| `item_pedido` com `ON DELETE CASCADE` | Os itens não existem sem o pedido: apagar o pedido leva os itens junto |
| Dinheiro em `DECIMAL`, nunca `FLOAT` | `FLOAT` erra centavos em contas como 0,1 + 0,2 |
| `UNIQUE` em e-mail, CPF, CNPJ e nomes de espécie e categoria | O próprio banco impede duplicados; o sistema transforma o erro em "Já existe ..." |
| `CHECK (quantidade > 0)` no item do pedido | Um item com quantidade zero ou negativa não entra nem por engano |
| Confirmar pedido numa **transação** | Ou o estoque de todos os itens baixa, ou de nenhum. A baixa é uma conta só no banco (`... WHERE quantidade_estoque >= ?`), para dois pedidos ao mesmo tempo não venderem o mesmo item |

---

## Segurança: o que fizemos e por quê

O sistema guarda dados pessoais de clientes (nome, telefone, endereço) e de funcionários (CPF), além dos custos da loja. Por isso a segurança entrou desde o primeiro commit.

### Senhas e login

| Decisão | Como | Por que, neste sistema |
| --- | --- | --- |
| Senha nunca em texto puro | `bcryptjs`, custo 10 (`PasswordHasher`) | Se o banco vazar, ninguém lê a senha do dono. O bcrypt é lento de propósito e usa um "sal" diferente para cada senha. O `bcryptjs` é JavaScript puro e não dá erro de compilação no Windows |
| Regra de senha | Mínimo de 8 caracteres, com letras e números, no máximo 72 bytes (`Validador.senha`) | O bcrypt ignora o que passa de 72 bytes: uma senha maior pareceria mais forte do que é |
| Login resistente a chute | Mensagem genérica ("E-mail ou senha inválidos.") e bloqueio de 5 minutos depois de 5 erros (`AuthService`) | Não revela quais e-mails existem e atrapalha quem tenta adivinhar a senha |
| Mesmo tempo de resposta | O bcrypt roda mesmo quando o e-mail não existe (contra um hash falso) | Pelo relógio, ninguém descobre se um e-mail está cadastrado |
| Primeiro ADMIN pelo terminal | `npm run seed` pede a senha na hora, sem mostrar | A senha nunca fica escrita em SQL nem em arquivo do projeto |
| Senha nunca vai para a tela | A tela recebe `UsuarioSemSenha` | Nem o hash circula fora do Main |
| O ADMIN não desativa, exclui nem rebaixa a si mesmo | Conferido no `UsuarioService` | O sistema nunca fica sem alguém que consiga administrá-lo |

### Controle de acesso

| Decisão | Como | Por que, neste sistema |
| --- | --- | --- |
| Dois perfis | ADMIN (dono) e ATENDENTE (funcionário) | O atendente registra pedidos e clientes. Só o dono vê custo e margem, CPF de entregador, cadastra usuários e exclui registros |
| Permissão conferida no Main | Todo canal é registrado no `IpcRouter` com os perfis que podem usá-lo; ele consulta a `Sessao` antes de chamar o Service | Esconder o botão não basta: pelo DevTools dá para chamar `window.api` direto. Quem decide é o Main |
| Sessão guardada no Main | `Sessao` | A tela não consegue "se promover" a ADMIN pelo console |
| Menu conforme o perfil | Cada rota tem `perfis` (`rotas.ts`) | Conforto: o ATENDENTE não vê o que não pode usar. A segurança de verdade continua no Main |
| Quem registrou o pedido | Vem do usuário logado, não de um campo da tela | Ninguém registra um pedido "em nome de outro" |

### Dados de entrada e banco

| Decisão | Como | Por que, neste sistema |
| --- | --- | --- |
| Validação no Main | Classe `Validador` | CPF e CNPJ com dígito verificador, CEP com 8 dígitos, quantidade maior que zero, preço não negativo, tamanho máximo de texto. A validação da tela é só conforto, porque pode ser burlada |
| Sem SQL injection | Sempre `?` do `mysql2`, nunca juntar texto no SQL | Um nome de cliente como `'; DROP TABLE pedido; --` vira só texto, não comando |
| Nome de tabela protegido | Fixo na classe filha e conferido no `BaseRepository` (só letras minúsculas e `_`) | É a única parte do SQL que não aceita `?`; a conferência é uma segunda tranca |
| Erro técnico nunca vai para a tela | O `IpcRouter` devolve só "Erro inesperado." e o detalhe fica no terminal | Mensagens do banco revelam nomes de tabelas e do servidor, um mapa para um atacante |
| Senha do banco fora do código | `.env` no `.gitignore`; no repositório vai só o `.env.example` | O repositório vai para o GitHub. Senha commitada fica no histórico para sempre, mesmo se apagada depois |

### Janela do Electron

| Decisão | Como | Por que, neste sistema |
| --- | --- | --- |
| Electron isolado | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`main.ts`) | A tela não tem acesso ao Node nem ao disco. Só enxerga a função que o preload expõe |
| Só os canais do cardápio | `window.api.chamar` recusa canal fora do `CANAIS_PERMITIDOS` (`preload.ts`) | A tela não recebe o `ipcRenderer` inteiro, só uma porta controlada |
| Content-Security-Policy | `<meta>` no `index.html`: scripts só dos nossos arquivos | Bloqueia código injetado (XSS) e `onclick="..."` no HTML. Testado: um `<script>` injetado não roda |
| Texto da tela escapado | `escapar()` e `textContent` (`ui.ts`) | Um nome como `<script>` aparece como texto e nunca vira código |
| Origem dos pedidos conferida | O `IpcRouter` só atende a página do próprio sistema (`origem.ts`) | Recomendação do guia de segurança do Electron |
| A janela não navega para fora | Links externos abrem no navegador do computador (`main.ts`) | O sistema nunca carrega uma página de fora com acesso ao `window.api` |

### Dados sensíveis (LGPD) e APIs

| Decisão | Como | Por que, neste sistema |
| --- | --- | --- |
| CPF só de entregador | Necessário pelo contrato; mostrado mascarado (`***.456.789-**`) e só para ADMIN; o ATENDENTE recebe a lista **sem** o CPF, cortado no Service | Guardar só o necessário é o princípio da minimização da LGPD. Cliente não precisa de CPF, então não pedimos: dado que não existe não vaza |
| Custo e margem só para o ADMIN | O ATENDENTE recebe os produtos sem esses campos, cortados no Service | Informação estratégica da loja |
| APIs externas com cuidado | Só HTTPS, tempo limite e resposta conferida antes de salvar (`HttpClient`) | Uma resposta estranha ou fora do ar não pode corromper o cadastro |

---

## Permissões (canal → perfis)

| Canal | Perfis |
| --- | --- |
| `usuarios:*` | ADMIN |
| `clientes:listar`, `clientes:salvar`, `clientes:buscarCep` | ADMIN, ATENDENTE |
| `clientes:excluir` | ADMIN |
| `entregadores:listar` | ADMIN, ATENDENTE (ATENDENTE recebe sem CPF) |
| `entregadores:salvar`, `entregadores:excluir` | ADMIN |
| `especies:listar`, `categorias:listar` | ADMIN, ATENDENTE |
| `especies:salvar/excluir`, `categorias:salvar/excluir` | ADMIN |
| `fornecedores:*` | ADMIN |
| `produtos:listar` | ADMIN, ATENDENTE (ATENDENTE recebe sem custo e margem) |
| `produtos:salvar`, `produtos:excluir`, `produtos:cotacao` | ADMIN |
| `pedidos:listar`, `pedidos:salvar`, `pedidos:confirmar`, `pedidos:cancelar` | ADMIN, ATENDENTE |
| `pedidos:excluir` | ADMIN |
| `entregas:*` | ADMIN, ATENDENTE |
| `inicio:resumo` | ADMIN, ATENDENTE |
| `auth:login` | PUBLICO |
| `auth:sair`, `auth:atual` | ADMIN, ATENDENTE |

---

## Como criar um módulo

Um "módulo" é uma parte do sistema com tabela, regras e tela próprias (clientes, produtos, pedidos...). Todo módulo segue o **mesmo caminho** do diagrama acima. O exemplo completo é o módulo de **usuários**.

### Passo 1: Repository (`src/main/repositories/XxxRepository.ts`)

Herda do `BaseRepository`. O `listar`, o `buscarPorId` e o `excluir` já vêm prontos.

```ts
export class EspecieRepository extends BaseRepository<Especie> {
  constructor() {
    super(Database.instancia(), 'especie'); // nome da tabela FIXO, minúsculo
  }
  async inserir(dados: Omit<Especie, 'id'>): Promise<number> { /* INSERT com ? */ }
  async atualizar(id: number, dados: Omit<Especie, 'id'>): Promise<void> { /* UPDATE com ? */ }
}
```

- SQL **sempre** com `?`, nunca juntando texto.
- Coluna `UNIQUE`? No `catch`: `if (this.ehErroDeDuplicidade(erro)) throw new ErroDeNegocio('Já existe ...');`

### Passo 2: Service (`src/main/services/XxxService.ts`)

Aqui ficam as **regras**. Tudo o que chega da tela é conferido com o `Validador` antes de ir ao repository. Erro que o usuário precisa ver = `throw new ErroDeNegocio('mensagem')`.

Se o resultado muda conforme o perfil (ex.: ATENDENTE não vê custo), o método recebe o `perfil` e corta os campos **aqui**, nunca só na tela.

### Passo 3: Canais (`src/shared/canais.ts`)

Acrescente os nomes **na sua seção** da lista `CANAIS_PERMITIDOS`, no formato `'modulo:acao'`. Canal fora dessa lista é recusado pelo preload, e o IpcRouter avisa no terminal ao abrir o programa.

### Passo 4: Arquivo IPC (`src/main/ipc/xxxIpc.ts`)

Liga cada canal a um método do service, dizendo **quem pode** (veja a tabela de permissões):

```ts
export function registrarCatalogoIpc(router: IpcRouter): void {
  const service = new CatalogoService(new EspecieRepository(), new CategoriaRepository());

  router.registrar<void, Especie[]>('especies:listar', ['ADMIN', 'ATENDENTE'], () =>
    service.listarEspecies(),
  );
  // o 2º parâmetro do handler é quem está logado:
  router.registrar<void, Produto[] | ProdutoSemCusto[]>('produtos:listar', ['ADMIN', 'ATENDENTE'],
    (_dados, usuario) => produtoService.listar(usuario!.perfil),
  );
}
```

O IpcRouter já faz sozinho: confere o login e o perfil, faz o `try/catch` e devolve `{ ok: true, dados }` ou `{ ok: false, erro }`. **Não escreva `try/catch` aqui.**

### Passo 5: Uma linha no `src/main.ts`

Na **sua seção**, um `import` lá em cima e uma chamada dentro de `registrarTodosOsCanais()`.

### Passo 6: Página (`src/renderer/pages/XxxPage.ts`)

```ts
import { escapar, mostrarAlerta } from '../ui';

export class CatalogoPage {
  async render(app: HTMLElement): Promise<void> {
    app.innerHTML = `<h2 class="h4">Espécies</h2><div id="catalogo-alerta"></div><ul id="catalogo-lista"></ul>`;
    const resposta = await window.api.chamar<Especie[]>('especies:listar');
    if (!resposta.ok) {
      mostrarAlerta(app.querySelector('#catalogo-alerta') as HTMLElement, 'danger', resposta.erro);
      return;
    }
    // resposta.dados é a lista...
  }
}
```

Regras da tela (a Content-Security-Policy **bloqueia** o que estiver fora delas):
- **Nada de `onclick="..."`** nem `<script>` dentro do HTML. Ligue os botões com `addEventListener`.
- Todo texto que vem de dados entra no HTML com `escapar(...)`, ou use `textContent`.
- Erro do Main: mostre `resposta.erro` com `mostrarAlerta(...)`.
- Excluir sempre com confirmação: `if (await confirmar('Excluir cliente', 'Excluir "Ana"?', 'Excluir')) { ... }` (janela modal do Bootstrap, no `ui.ts`).
- Lista com botões por linha: em vez de um `addEventListener` por botão, um só na tabela, lendo `data-acao` e `data-id` (veja a `UsuariosPage`).
- Use ids com o nome do módulo (`catalogo-lista`), para não bater com os de outra tela.

### Passo 7: Uma linha no `src/renderer/rotas.ts`

Na **sua seção**, o `import` e a rota (vira um item do menu). O `perfis` da rota define quem **vê** o item; o do `registrar(...)` define quem **pode usar** o canal. Os dois precisam bater com a tabela de permissões.

```ts
  { id: 'catalogo', titulo: 'Catálogo', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new CatalogoPage() },
```

### Passo 8: Testar e fazer o commit

1. `npm run typecheck` (sem nenhuma mensagem = sem erros) e `npm start`.
2. Teste **como ADMIN e como ATENDENTE**, e também os erros: campo vazio, valor repetido, excluir algo em uso.
3. Ritual de commit: Fetch/Pull antes, conferir a lista de arquivos (nunca o `.env`), uma história por commit, Push.
