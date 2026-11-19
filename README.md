# Agenda de Pacientes

Agenda compartilhada do consultório. Ela e as funcionárias marcam horários pelo celular ou pelo computador, e todas veem as mudanças na hora.

- **Site:** GitHub Pages (arquivos estáticos, sem servidor).
- **Login e dados:** Firebase (Authentication + Cloud Firestore, plano gratuito Spark, servidor em São Paulo).
- **Instalável no celular** (PWA) e com leitura sem internet.

> Este guia é para quem administra o sistema (o admin). Quem só usa a agenda não precisa ler nada disto.

---

## Sumário

1. [Testar no computador](#1-testar-no-computador)
2. [Publicar pela primeira vez](#2-publicar-pela-primeira-vez)
   - [A. Firebase](#a-firebase)
   - [B. GitHub Pages](#b-github-pages)
   - [C. Primeiro acesso](#c-primeiro-acesso)
   - [D. Instalar no celular](#d-instalar-no-celular)
3. [Atualizar o site depois](#3-atualizar-o-site-depois)
4. [Problemas comuns](#4-problemas-comuns)
5. [Segurança, LGPD e backup](#5-segurança-lgpd-e-backup)
6. [Como o sistema é organizado](#6-como-o-sistema-é-organizado)

---

## 1. Testar no computador

Precisa ter instalados: **Node.js** e **Java** (os dois já estão neste computador).

Na pasta do projeto, rode:

```bash
npm run dev
```

- O site abre em **http://127.0.0.1:5000**, com o selo amarelo **MODO TESTE**.
- O painel do banco de testes fica em **http://127.0.0.1:4000**.
- Os dados são falsos e voltam ao estado inicial cada vez que você religa. As contas de teste estão no topo de `scripts/seed-emulador.mjs`.
- Para desligar: `Ctrl + C` no terminal.

Nada do que acontece nesse modo vai para a internet.

---

## 2. Publicar pela primeira vez

### A. Firebase

**A1. Criar o projeto**
1. Entre em https://console.firebase.google.com com a sua conta Google.
2. **Criar um projeto** → dê um nome (ex.: `agenda-consultorio`) → **Continuar**.
3. Desative o **Google Analytics** → **Criar projeto** → **Continuar**.

**A2. Ligar o login por e-mail e senha**
1. No menu da esquerda: **Criação → Authentication → Vamos começar**.
2. Aba **Método de login** → **E-mail/senha** → ative a primeira chave → **Salvar**.
3. Aba **Modelos** → ícone de lápis ao lado do idioma → **Português (Brasil)**. Assim o e-mail de "Esqueci minha senha" chega em português.

**A3. Criar o banco de dados**
1. Menu: **Criação → Firestore Database → Criar banco de dados**.
2. Edição **Standard** → ID `(default)` → local **`southamerica-east1 (São Paulo)`** → **Avançar**.
3. Escolha **Iniciar no modo de produção** → **Criar**.
   As regras de verdade são publicadas no passo A6.

**A4. Registrar o site (app Web)**
1. Clique na engrenagem ⚙️ ao lado de "Visão geral do projeto" → **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web).
3. Apelido: `agenda`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
4. Aparece um bloco `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
   Copie esses valores para `js/firebase-config.js`, no lugar dos `COLE_AQUI` (ou mande o bloco para o Claude colar).

> É normal essa configuração ficar visível no site. Ela só diz *qual* projeto usar. Quem protege os dados são o login e as **regras** do passo A6.

**A5. Autorizar o endereço do site**
1. **Authentication → Configurações → Domínios autorizados → Adicionar domínio**.
2. Digite `SEUUSUARIO.github.io` (o seu usuário do GitHub) → **Adicionar**.

**A6. Publicar as regras de segurança e os índices**

Pelo terminal, na pasta do projeto:

```bash
npx --yes firebase-tools@15.37.0 login
```

Abre o navegador para você entrar na conta Google. Depois:

```bash
npx --yes firebase-tools@15.37.0 deploy --only firestore --project ID-DO-PROJETO
```

`ID-DO-PROJETO` é o `projectId` do passo A4. Esse comando envia o arquivo `firestore.rules`, com quem pode ler e gravar o quê, e o `firestore.indexes.json`, com os índices que o calendário e a busca precisam.

Os índices levam alguns minutos para ficar prontos. Você acompanha em **Firestore → Índices**.

<details>
<summary>Sem terminal (pelo site do Firebase)</summary>

1. **Firestore → Regras**: apague tudo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
2. **Índices**: ao usar o calendário e a busca pela primeira vez, o console do navegador (F12) mostra um erro com um link "You can create it here". Abra cada link e clique em **Criar índice**. São 4 índices no total, listados em `firestore.indexes.json`.

</details>

**A7. Criar a sua conta de admin** (só esta vez; as outras são criadas pelo próprio site)
1. **Authentication → Usuários → Adicionar usuário** → seu e-mail e uma senha → **Adicionar usuário**.
2. Copie o **UID do usuário**, o código comprido da coluna da direita.
3. **Firestore Database → Dados → + Iniciar coleção**:
   - ID da coleção: `usuarios` → **Próximo**
   - ID do documento: cole o **UID**
   - Campos (cuidado com o **tipo** de cada um):

     | Campo | Tipo | Valor |
     |---|---|---|
     | `nome` | string | seu nome |
     | `email` | string | seu e-mail |
     | `papel` | string | `admin` |
     | `ativo` | boolean | `true` |

   - **Salvar**.

### B. GitHub Pages

1. Em https://github.com/new crie um repositório:
   - nome **`agenda`**;
   - **Public**;
   - **sem** README, .gitignore ou licença (ele precisa nascer vazio).
2. Envie os arquivos (o Claude faz isso com o Git). Na primeira vez, abre uma janela para você entrar no GitHub.
3. No repositório: **Settings → Pages**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` e pasta `/ (root)` → **Save**
4. Espere 1 ou 2 minutos. O site fica em **`https://SEUUSUARIO.github.io/agenda/`**.

### C. Primeiro acesso

Entre no site com a conta do passo A7 e toque em **Config.**:

1. **Clínica → Editar:** nome da clínica, intervalo e horário padrão.
2. **Agendas → + Nova agenda:** crie a agenda da doutora com o horário de atendimento. Sem pelo menos uma agenda, ninguém consegue marcar.
3. **Usuárias → + Nova usuária:** crie a conta da sua prima e de cada funcionária. Use o e-mail real de cada uma e passe a senha provisória que aparece na tela.
4. **Mensagem do WhatsApp:** ajuste o texto se quiser.

### D. Instalar no celular

- **Android (Chrome):** abra o site e toque em **Instalar** no aviso verde, ou no menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o site no Safari → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.

O ícone de calendário verde aparece ao lado dos outros apps e abre a agenda em tela cheia.

---

## 3. Atualizar o site depois

Depois de qualquer mudança nos arquivos:

```bash
git add -A
```

```bash
git commit -m "Descreva a mudança"
```

```bash
git push
```

Em 1 ou 2 minutos o GitHub Pages publica. Nos celulares, a versão nova aparece na próxima vez que o app for aberto com internet.

Se você mudar `firestore.rules` ou `firestore.indexes.json`, rode de novo o comando `deploy` do passo A6.

---

## 4. Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Sua conta não está liberada ou foi desativada" | Em **Config. → Usuárias**, confira se a pessoa está **ativa**. Se for a sua conta de admin, confira o documento `usuarios/{UID}` (passo A7): `ativo` precisa ser **boolean** `true`, não o texto "true". |
| Esqueceu a senha | Na tela de login: digite o e-mail e toque em **Esqueci minha senha**. Chega um e-mail (veja o spam). |
| "Esse e-mail já tem uma conta de login, mas não está na lista de usuárias" | Alguém tem login no Authentication sem cadastro em `usuarios`. Ou crie o documento `usuarios/{UID}` como no passo A7 (com `papel: funcionaria`), ou apague esse usuário em **Authentication → Usuários** e crie de novo pelo site. |
| Calendário ou busca não carregam ("Não foi possível carregar") | Os índices ainda não ficaram prontos ou não foram criados (passo A6). Veja **Firestore → Índices**. |
| Login dá erro só no site publicado | Faltou o passo A5 (domínio autorizado). |
| Celular mostra a versão antiga | Feche o app totalmente e abra de novo com internet. |
| Ex-funcionária | **Config. → Usuárias** → desmarque "ativa". Ela sai na hora, em qualquer aparelho, e os dados guardados no aparelho dela são apagados. |

---

## 5. Segurança, LGPD e backup

- **Quem vê o quê:** só quem tem login **e** cadastro ativo em `usuarios` lê ou grava alguma coisa. Isso é garantido pelas regras do Firestore no servidor, não só pela tela. Funcionária não altera configurações, não apaga definitivamente e não cria consultas em dias passados.
- **Dados guardados:** só o nome e o telefone do paciente, mais a situação e a observação. A tela avisa para não escrever diagnóstico nem informação clínica.
- **Nenhum dado de paciente vai no endereço do site.** A exceção é o botão do WhatsApp: o link `wa.me` leva o número e a mensagem, porque é assim que ele abre a conversa.
- **No aparelho:** a agenda fica guardada para funcionar sem internet. Ao tocar em **Sair**, ou quando a conta é desativada, essa cópia é apagada.
- **Folha impressa:** contém dados pessoais e deve ser guardada com cuidado.
- **Backup:** o plano gratuito (Spark) **não faz backup automático**. O Firebase é bem confiável, mas, se alguém apagar algo por engano, não há como desfazer. Se isso preocupar, dá para:
  - ativar o plano Blaze, que cobra por uso e sai praticamente de graça neste volume, e usar o backup agendado do Firestore;
  - ou pedir ao Claude um botão de "exportar planilha" em Configurações.
- **Opcional, mais proteção:** no Google Cloud Console → **APIs e serviços → Credenciais**, restrinja a chave de API ao site `SEUUSUARIO.github.io/*`.

---

## 6. Como o sistema é organizado

```
index.html            página única (login + app); telas por endereço: #/dia/AAAA-MM-DD, #/mes/AAAA-MM, #/busca, #/config
css/style.css         visual (celular primeiro)
js/firebase-config.js configuração do projeto Firebase (passo A4)
js/firebase.js        liga o Firebase (no computador usa o emulador)
js/app.js             login, troca de telas, instalação no celular
js/auth.js            entrar, sair, esqueci a senha, checagem da conta ativa
js/store.js           configuração da clínica e agendas, em tempo real
js/agenda.js          regras da agenda: horários, marcar, encaixe, cancelar, bloqueios, busca
js/feriados.js        feriados nacionais (fixos + Páscoa) e pontos facultativos
js/whatsapp.js        mensagem e link do WhatsApp
js/admin.js           operações do admin (clínica, agendas, usuárias)
js/ui-*.js            telas: dia, mês, busca, configurações, janelas
sw.js, manifest.json  app instalável e funcionamento sem internet
icons/                ícones do app
firestore.rules       regras de segurança do banco
firestore.indexes.json índices do banco
firebase.json         configuração do emulador local
scripts/              ambiente de testes (emulador + dados falsos)
```

**Modelo de dados (Firestore):**

| Coleção | Conteúdo |
|---|---|
| `config/clinica` | nome, intervalo, horário padrão, texto do WhatsApp |
| `profissionais/{id}` | agendas: nome, cor, ativa, horário semanal |
| `usuarios/{uid}` | quem pode entrar: nome, e-mail, papel (`admin`/`funcionaria`), ativo |
| `agendamentos/{agenda}_{data}_{hora}` | horário normal (o ID fixo impede marcar dois no mesmo horário) |
| `agendamentos/{automático}` | encaixes |
| `cancelados/` | consultas canceladas que foram substituídas por outro paciente |
| `bloqueios/` | horários bloqueados |
| `fechamentos/{data}_{alvo}` | dias fechados (alvo = `clinica` ou a agenda) |
