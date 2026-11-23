# Pet Shop DAD

Sistema desktop para um pet shop que vende pelo WhatsApp e faz entregas com motoboys próprios.

## Funcionalidades
- Cadastro de clientes, produtos, fornecedores e entregadores
- Pedidos com controle de estoque
- Cálculo da taxa de entrega pela distância
- Cotação do dólar para produtos importados

## Tecnologias
Electron, TypeScript e MySQL

## Disciplina
Projeto final de DAD (Desenvolvimento de Aplicações Desktop)

---

## Como rodar (desenvolvimento)

1. `npm install`
2. Copie o `.env.example` para `.env` e preencha os dados do MySQL.
3. `npm run db:testar` confere a conexão, as 10 tabelas e o relógio do servidor.
4. **Só na primeira vez (banco sem nenhum usuário):** `npm run seed` cria o primeiro ADMIN. Ele pergunta nome, e-mail e senha no terminal (a senha não aparece enquanto você digita).
5. `npm start` abre o sistema na tela de login.

---

## Como criar um módulo

Um "módulo" é uma parte do sistema com tabela, regras e tela próprias (clientes, produtos, pedidos...). Todo módulo segue o **mesmo caminho**:

```
 XxxPage ──window.api.chamar('xxx:acao')──▶ preload ──▶ IpcRouter ──▶ XxxService ──▶ XxxRepository ──▶ Database ──▶ MySQL
 (tela)      (só o que está no canais.ts)    (balcão)    (confere      (regras)       (SQL com ?)
                                                          login/perfil)
```

O exemplo completo e funcionando é o módulo de **usuários** (`usuarios:listar`). Copie a estrutura dele.

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

Acrescente os nomes **na sua seção** da lista `CANAIS_PERMITIDOS`, no formato `'modulo:acao'`:

```ts
  // --- Integrante 3 ---
  'especies:listar',
  'especies:salvar',
  'especies:excluir',
```

Canal fora dessa lista é recusado pelo preload, e o IpcRouter avisa no terminal ao abrir o programa.

### Passo 4: Arquivo IPC (`src/main/ipc/xxxIpc.ts`)

Liga cada canal a um método do service, dizendo **quem pode** (veja a tabela de permissões abaixo):

```ts
export function registrarCatalogoIpc(router: IpcRouter): void {
  const service = new CatalogoService(new EspecieRepository(), new CategoriaRepository());

  router.registrar<void, Especie[]>('especies:listar', ['ADMIN', 'ATENDENTE'], () =>
    service.listarEspecies(),
  );
  router.registrar<Partial<Especie>, number>('especies:salvar', ['ADMIN'], (dados) =>
    service.salvarEspecie(dados),
  );
  // o 2º parâmetro do handler é quem está logado:
  router.registrar<void, Produto[] | ProdutoSemCusto[]>('produtos:listar', ['ADMIN', 'ATENDENTE'],
    (_dados, usuario) => produtoService.listar(usuario!.perfil),
  );
}
```

O IpcRouter já faz sozinho: confere o login e o perfil, faz o `try/catch` e devolve `{ ok: true, dados }` ou `{ ok: false, erro }`. **Não escreva `try/catch` aqui.**

### Passo 5: Uma linha no `src/main.ts`

Na **sua seção**, um `import` lá em cima e uma chamada dentro de `registrarTodosOsCanais()`:

```ts
// --- Integrante 3 ---
import { registrarCatalogoIpc } from './main/ipc/catalogoIpc';
...
  // --- Integrante 3 ---
  registrarCatalogoIpc(router);
```

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
- A validação da tela é só conforto. Quem decide é o Main.
- Use ids com o nome do módulo (`catalogo-lista`), para não bater com os de outra tela.

### Passo 7: Uma linha no `src/renderer/rotas.ts`

Na **sua seção**, o `import` e a rota (vira um item do menu):

```ts
// --- Integrante 3 ---
import { CatalogoPage } from './pages/CatalogoPage';
...
  // --- Integrante 3 ---
  { id: 'catalogo', titulo: 'Catálogo', perfis: ['ADMIN', 'ATENDENTE'], criar: () => new CatalogoPage() },
```

### Passo 8: Testar e fazer o commit

1. `npm run typecheck` (sem nenhuma mensagem = sem erros) e `npm start`.
2. Teste também os erros: campo vazio, valor repetido, excluir algo em uso.
3. Siga o ritual de commit (Fetch/Pull antes, conferir a lista de arquivos, nunca o `.env`).

### Tabela de permissões (canal → perfis)

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

### Testar com os dois perfis

O banco é compartilhado, então o ADMIN criado pelo `npm run seed` serve para todo o grupo (peça o e-mail e a senha em particular). Teste as suas telas **como ADMIN e como ATENDENTE**: o item do menu some para quem não está no `perfis` da rota, e o IpcRouter recusa o canal com "Você não tem permissão para fazer isso.".

---

## Segurança da janela (o que já está pronto)

| Trava | Onde | Para quê |
| --- | --- | --- |
| `contextIsolation: true` | `src/main.ts` | A tela e o preload vivem em "mundos" separados: a tela não mexe no código do preload |
| `nodeIntegration: false` | `src/main.ts` | A tela não acessa o Node (arquivos, banco, comandos do computador) |
| `sandbox: true` | `src/main.ts` | A tela roda isolada, como um site no navegador |
| Content-Security-Policy | `index.html` | Bloqueia scripts injetados (XSS) e qualquer conteúdo de fora |
| `window.api.chamar` só com canais da lista | `src/preload.ts` | A tela só pede o que está no "cardápio" |
| Login e perfil conferidos no Main | `src/main/ipc/IpcRouter.ts` | Esconder um botão não basta: o Main recusa quem não pode |
| Origem do pedido conferida | `src/main/ipc/IpcRouter.ts` | Só a página do próprio sistema pode chamar o Main |
| Erro técnico nunca vai para a tela | `src/main/ipc/IpcRouter.ts` | A tela recebe só "Erro inesperado." e o detalhe fica no terminal |
| Janela não navega para fora | `src/main.ts` | Links externos abrem no navegador do computador |
| Senha com bcrypt (custo 10) | `src/main/security/PasswordHasher.ts` | O banco guarda só o hash: nem quem tem acesso ao banco vê as senhas |
| Mensagem genérica no login | `src/main/services/AuthService.ts` | "E-mail ou senha inválidos." não revela quais e-mails existem |
| Bloqueio de 5 minutos após 5 erros | `src/main/services/AuthService.ts` | Impede testar milhares de senhas |
| Mesmo tempo de resposta no login | `src/main/services/AuthService.ts` | O bcrypt roda mesmo quando o e-mail não existe |
| Sessão guardada no Main | `src/main/security/Sessao.ts` | A tela não consegue "se promover" a ADMIN pelo DevTools |
| Senha nunca vai para a tela | `src/main/services/UsuarioService.ts` | A tela recebe `UsuarioSemSenha` |
