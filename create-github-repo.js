/**
 * Script para criar um repositório no GitHub via API
 * 
 * Uso:
 * 1. Obtenha um Personal Access Token em: https://github.com/settings/tokens
 *    - Permissões necessárias: repo (Full control of private repositories)
 * 2. Execute: node create-github-repo.js
 * 
 * Ou defina a variável de ambiente GITHUB_TOKEN antes de executar
 */

const https = require('https');

// Configurações
const REPO_NAME = 'backend-estoque';
const REPO_DESCRIPTION = 'Backend REST API para módulo de estoque/solicitações de materiais de marketing';
const IS_PRIVATE = false; // true para repositório privado, false para público
const USERNAME = 'LucasNovosado';

// Obter token do GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.argv[2];

if (!GITHUB_TOKEN) {
  console.error('\n❌ Erro: Token do GitHub não fornecido!\n');
  console.log('📝 Como obter um token:');
  console.log('   1. Acesse: https://github.com/settings/tokens');
  console.log('   2. Clique em "Generate new token" > "Generate new token (classic)"');
  console.log('   3. Dê um nome (ex: "Cursor Repo Creator")');
  console.log('   4. Marque a permissão "repo" (Full control of private repositories)');
  console.log('   5. Clique em "Generate token"');
  console.log('   6. Copie o token gerado\n');
  console.log('💡 Depois execute:');
  console.log(`   $env:GITHUB_TOKEN="seu_token_aqui"; node create-github-repo.js\n`);
  console.log('   Ou:');
  console.log(`   node create-github-repo.js seu_token_aqui\n`);
  process.exit(1);
}

// Dados do repositório
const repoData = JSON.stringify({
  name: REPO_NAME,
  description: REPO_DESCRIPTION,
  private: IS_PRIVATE,
  auto_init: false // Não inicializar com README
});

// Opções da requisição
const options = {
  hostname: 'api.github.com',
  path: '/user/repos',
  method: 'POST',
  headers: {
    'User-Agent': 'Node.js',
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': repoData.length,
    'Accept': 'application/vnd.github.v3+json'
  }
};

console.log(`\n🚀 Criando repositório "${REPO_NAME}" no GitHub...\n`);

// Fazer a requisição
const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 201) {
      const response = JSON.parse(data);
      console.log('✅ Repositório criado com sucesso!\n');
      console.log(`📦 Nome: ${response.name}`);
      console.log(`🔗 URL: ${response.html_url}`);
      console.log(`🌐 Clone URL: ${response.clone_url}\n`);
      
      console.log('📋 Próximos passos:\n');
      console.log('   # Adicionar remote');
      console.log(`   git remote add origin ${response.clone_url}\n`);
      console.log('   # Fazer commit inicial');
      console.log('   git add .');
      console.log('   git commit -m "Initial commit: Backend REST API para estoque"');
      console.log('   git branch -M main');
      console.log('   git push -u origin main\n');
    } else {
      console.error(`❌ Erro ao criar repositório (Status: ${res.statusCode})\n`);
      console.error('Resposta:', data);
      
      if (res.statusCode === 401) {
        console.error('\n💡 O token pode estar inválido ou expirado.');
        console.error('   Gere um novo token em: https://github.com/settings/tokens\n');
      } else if (res.statusCode === 422) {
        console.error('\n💡 O repositório pode já existir ou o nome é inválido.');
        console.error('   Tente com outro nome ou verifique se já existe.\n');
      }
    }
  });
});

req.on('error', (error) => {
  console.error(`\n❌ Erro na requisição: ${error.message}\n`);
});

req.write(repoData);
req.end();
