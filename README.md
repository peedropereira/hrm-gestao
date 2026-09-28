# HRM Gestão

Sistema de gestão pessoal do Gerente Geral da HRM Caldeiraria Industrial: Painel do Dia, Ações, Caixa de Entrada e Setores, com Agenda, Metas e Relatórios chegando nas próximas fases.

Feito para o celular (instala como aplicativo) e para o computador do escritório.

---

## Sumário

1. [O que você vai precisar](#1-o-que-você-vai-precisar)
2. [Colocar o código no GitHub](#2-colocar-o-código-no-github)
3. [Criar o projeto na Vercel](#3-criar-o-projeto-na-vercel)
4. [Criar o banco de dados (Neon)](#4-criar-o-banco-de-dados-neon)
5. [Criar o armazenamento de fotos (Blob)](#5-criar-o-armazenamento-de-fotos-blob)
6. [Configurar as variáveis e criar seu usuário](#6-configurar-as-variáveis-e-criar-seu-usuário)
7. [Publicar (deploy)](#7-publicar-deploy)
8. [Instalar no celular](#8-instalar-no-celular)
9. [Backup](#9-backup)
10. [Dia a dia: como atualizar o sistema](#10-dia-a-dia-como-atualizar-o-sistema)
11. [Para desenvolvedores](#11-para-desenvolvedores)

---

## 1. O que você vai precisar

- Conta no **GitHub** (github.com), gratuita. Guarda o código.
- Conta na **Vercel** (vercel.com), gratuita. Coloca o sistema no ar.
- Uns 20 minutos.

> **Segurança:** senhas e chaves só vão no painel da Vercel, em *Environment Variables*. Nunca em arquivos, e-mails ou mensagens.

## 2. Colocar o código no GitHub

1. Entre em github.com e clique em **New** (novo repositório).
2. Nome: `hrm-gestao`. Marque **Private** (privado). Não marque nenhuma outra opção. Clique em **Create repository**.
3. Na pasta do projeto no computador, rode (trocando `SEU-USUARIO`):

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/hrm-gestao.git
   git push -u origin main
   ```

   Na primeira vez o Windows abre uma janela pedindo login do GitHub. Faça o login por ela.

## 3. Criar o projeto na Vercel

1. Entre em vercel.com e clique em **Add New… → Project**.
2. Em *Import Git Repository*, conecte sua conta do GitHub (se pedir) e escolha `hrm-gestao`. Clique em **Import**.
3. **Ainda não clique em Deploy.** Primeiro faça os passos 4, 5 e 6. Se já clicou, tudo bem: o primeiro deploy falha por falta de banco; depois é só refazer (passo 7).

## 4. Criar o banco de dados (Neon)

1. No projeto da Vercel, abra a aba **Storage** → **Create Database** → escolha **Neon** (Serverless Postgres) → **Continue**.
2. Região: **São Paulo (gru1)** se aparecer; senão, a mais próxima (Washington, iad1). Plano **Free**.
3. Nome: `hrm-gestao`. Clique em **Create** e depois em **Connect** ao projeto, marcando os ambientes *Production*, *Preview* e *Development*.
4. Pronto: a Vercel cria sozinha as variáveis `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.

## 5. Criar o armazenamento de fotos (Blob)

1. Na aba **Storage** → **Create Database** → **Blob** → **Continue**.
2. Nome: `hrm-evidencias` → **Create** → **Connect** ao projeto.
3. A variável `BLOB_READ_WRITE_TOKEN` é criada automaticamente.

## 6. Configurar as variáveis e criar seu usuário

No projeto da Vercel: **Settings → Environment Variables**. Adicione uma por uma (ambiente *Production*):

| Nome | Valor |
| --- | --- |
| `AUTH_SECRET` | Um texto aleatório longo. Gere em https://generate-secret.vercel.app/32 e cole. |
| `SEED_USER_LOGIN` | Seu usuário de acesso, ex.: `pedro` |
| `SEED_USER_NAME` | Seu nome, ex.: `Pedro` |
| `SEED_USER_PASSWORD` | Sua senha inicial (mínimo 8 caracteres). Você digita aqui, direto na Vercel. |
| `SEED_DEMO` | `true` para começar com dados de exemplo, `false` para começar vazio |

O usuário é criado **uma única vez**, no primeiro deploy. Depois de entrar:

1. Troque a senha em **Configurações → Trocar senha**.
2. Volte na Vercel e **apague** a variável `SEED_USER_PASSWORD` (ela não é mais necessária).

## 7. Publicar (deploy)

1. Na Vercel, aba **Deployments**. Se ainda não houve deploy, volte à tela do projeto e clique em **Deploy**. Se já houve (e falhou), clique nos três pontinhos do último deploy → **Redeploy**.
2. Aguarde uns 2 minutos. O deploy cria as tabelas no banco, seu usuário e os setores iniciais.
3. Clique em **Visit**. O endereço será algo como `hrm-gestao.vercel.app`.
4. Entre com o usuário e a senha do passo 6.

A partir daí, **cada atualização enviada ao GitHub é publicada sozinha** em 1 a 2 minutos.

## 8. Instalar no celular

**iPhone (Safari):**

1. Abra o endereço do sistema no **Safari** e faça o login.
2. Toque no botão **Compartilhar** (quadrado com seta para cima).
3. Role e toque em **Adicionar à Tela de Início** → **Adicionar**.
4. Abra pelo ícone novo: o sistema abre em tela cheia, como aplicativo.

**Android (Chrome):**

1. Abra o endereço no **Chrome** e faça o login.
2. Toque nos **três pontinhos** (canto superior direito).
3. Toque em **Instalar app** (ou **Adicionar à tela inicial**) → **Instalar**.

Dica: segure o ícone do app para ver atalhos como **Capturar** e **Ações atrasadas**.

## 9. Backup

**Manual (recomendado toda sexta):** Configurações → **Baixar todos os dados (JSON)**. Guarde o arquivo no OneDrive ou em outro lugar seguro.

**Automático (Neon):** o Neon guarda o histórico do banco e permite voltar no tempo (*Point-in-time restore*). No plano gratuito a janela é curta (horas); no plano pago chega a dias. Para usar:

1. Na Vercel → **Storage** → seu banco Neon → **Open in Neon Console**.
2. Menu **Backup & Restore** (ou *Restore*): escolha data e hora e restaure. Em caso de dúvida, crie primeiro uma *branch* de teste a partir daquele horário, confira e só depois restaure a principal.

**Fotos:** ficam no Vercel Blob e não são apagadas pelo sistema.

## 10. Dia a dia: como atualizar o sistema

- Cada fase nova chega como atualização no GitHub e é publicada sozinha.
- Mudanças no banco (tabelas novas) são aplicadas automaticamente no deploy.
- Se algo der errado num deploy, na Vercel → **Deployments** → escolha o anterior → **Promote to Production** para voltar na hora.

## 11. Para desenvolvedores

Stack: Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS 4, shadcn/ui, Motion, Prisma 7 + PostgreSQL (Neon), Auth.js v5 (credenciais, JWT de 30 dias), Vercel Blob, PWA com service worker próprio.

```bash
npm install
cp .env.example .env         # preencha os valores
npx prisma dev --detach      # (opcional) Postgres local; copie a URL para o .env
npm run db:migrate           # cria as tabelas
npm run db:seed              # usuário, setores e exemplos
npm run dev                  # http://localhost:3000
```

Estrutura:

```
prisma/schema.prisma        modelo de dados
prisma/seed.ts              usuário inicial, setores e exemplos
src/proxy.ts                bloqueia tudo sem login
src/auth.ts                 login (bcrypt, registro de tentativas)
src/app/actions/            Server Actions (validação com zod, sempre filtrando pelo dono)
src/app/(app)/              telas autenticadas: hoje, acoes, caixa, setores, config
src/components/             design system (ds.tsx, button, sheet) e peças compartilhadas
src/lib/nl-parse.ts         interpretação de texto natural ("cobrar Marcos … sexta #manutencao")
src/lib/dates.ts            datas no fuso America/Sao_Paulo
src/lib/demo.ts             setores iniciais e dados de exemplo
public/sw.js                service worker (uso com sinal fraco)
```

Segurança: senhas com bcrypt (custo 12); bloqueio de 15 min após 5 erros; troca de senha invalida sessões de outros aparelhos; cookies httpOnly/secure; cabeçalhos de segurança em `next.config.ts`; todas as consultas filtram por `ownerId`.
