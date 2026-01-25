# 🚀 Criar Repositório no GitHub pelo Cursor

## Método 1: Usando o Script Automatizado (Recomendado)

### Passo 1: Obter Token do GitHub

1. Acesse: **https://github.com/settings/tokens**
2. Clique em **"Generate new token"** > **"Generate new token (classic)"**
3. Dê um nome: `Cursor Repo Creator`
4. Marque a permissão: **`repo`** (Full control of private repositories)
5. Clique em **"Generate token"** no final da página
6. **COPIE O TOKEN** (você só verá ele uma vez!)

### Passo 2: Executar o Script

No terminal do Cursor, execute:

```powershell
# Opção 1: Definir token como variável de ambiente
$env:GITHUB_TOKEN="seu_token_aqui"; node create-github-repo.js

# Opção 2: Passar token como argumento
node create-github-repo.js seu_token_aqui
```

### Passo 3: Conectar e Fazer Push

O script vai mostrar os comandos, mas basicamente:

```bash
git remote add origin https://github.com/LucasNovosado/backend-estoque.git
git add .
git commit -m "Initial commit: Backend REST API para estoque"
git branch -M main
git push -u origin main
```

---

## Método 2: Via Site do GitHub (Mais Simples)

Se preferir fazer manualmente:

1. Acesse: **https://github.com/new**
2. Nome: `backend-estoque`
3. Descrição: `Backend REST API para módulo de estoque/solicitações de materiais de marketing`
4. Escolha Público ou Privado
5. **NÃO marque** "Initialize with README"
6. Clique em **"Create repository"**

Depois me avise e eu conecto automaticamente! 😊

---

## Configurações do Script

Se quiser personalizar, edite o arquivo `create-github-repo.js`:

- `REPO_NAME`: Nome do repositório
- `REPO_DESCRIPTION`: Descrição
- `IS_PRIVATE`: `true` para privado, `false` para público
- `USERNAME`: Seu username do GitHub
