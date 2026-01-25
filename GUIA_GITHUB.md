# Guia para Conectar ao GitHub

## Passo 1: Criar o Repositório no GitHub

1. Acesse: https://github.com/new
2. **Nome do repositório**: `backend-estoque` (ou outro nome de sua preferência)
3. **Descrição** (opcional): "Backend REST API para módulo de estoque/solicitações de materiais de marketing"
4. Escolha se será **Público** ou **Privado**
5. **NÃO marque** a opção "Initialize this repository with a README" (já temos arquivos locais)
6. Clique em **"Create repository"**

## Passo 2: Copiar a URL do Repositório

Após criar, o GitHub mostrará uma página com instruções. Você verá uma URL como:
- `https://github.com/LucasNovosado/backend-estoque.git`

**Copie essa URL!**

## Passo 3: Conectar o Repositório Local

Depois de criar o repositório no GitHub, execute os seguintes comandos no terminal:

```bash
# Adicionar o repositório remoto (substitua pela URL do seu repositório)
git remote add origin https://github.com/LucasNovosado/backend-estoque.git

# Verificar se foi adicionado corretamente
git remote -v

# Fazer o primeiro push (se ainda não tiver commits)
git add .
git commit -m "Initial commit: Backend REST API para estoque"
git branch -M main
git push -u origin main
```

## Alternativa: Usar SSH (Recomendado para maior segurança)

Se você tiver uma chave SSH configurada no GitHub:

```bash
git remote add origin git@github.com:LucasNovosado/backend-estoque.git
```

## Notas Importantes

- Seu Git já está configurado com:
  - Nome: LucasNovosado
  - Email: lucass.novosado@gmail.com

- O remote anterior foi removido para evitar conflitos

- Certifique-se de que o arquivo `.gitignore` está funcionando corretamente para não commitar arquivos desnecessários
