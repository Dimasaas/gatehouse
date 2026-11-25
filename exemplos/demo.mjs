// Uma sessão de ponta a ponta: sobe o servidor como cliente MCP e conversa com ele.
// Uso: npm run demo
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entrada = fileURLToPath(new URL('../src/index.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'mcp-leitura-demo-'));
const arquivoAuditoria = join(dir, 'auditoria.jsonl');

async function conectar(pessoa) {
  const cliente = new Client({ name: 'demo', version: '1.0.0' });
  await cliente.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [entrada],
      env: { ...process.env, MCP_PESSOA: pessoa, MCP_AUDITORIA: arquivoAuditoria },
      stderr: 'ignore',
    }),
  );
  return cliente;
}

async function chamar(cliente, quem, nome, argumentos = {}) {
  console.log(`\n[${quem}] ${nome} ${JSON.stringify(argumentos)}`);
  const r = await cliente.callTool({ name: nome, arguments: argumentos });
  const texto = r.content[0].text;
  console.log(r.isError ? `  RECUSADO -> ${texto}` : `  ${JSON.stringify(JSON.parse(texto))}`);
  return r.isError ? null : JSON.parse(texto);
}

const ana = await conectar('ana_atendimento');
const bruno = await conectar('bruno_analise');
const carla = await conectar('carla_estagio');

try {
  console.log('== 1. Cada pessoa enxerga um esquema diferente');
  await chamar(ana, 'ana', 'listar_tabelas');
  await chamar(carla, 'carla', 'listar_tabelas');

  console.log('\n== 2. Campo fora do escopo nem existe (e filtrar por ele também é recusado)');
  await chamar(ana, 'ana', 'consultar', { tabela: 'clientes', campos: ['nome', 'observacao_interna'] });
  await chamar(ana, 'ana', 'consultar', {
    tabela: 'clientes',
    campos: ['id', 'nome', 'cidade'],
    filtros: [{ campo: 'cidade', op: '=', valor: 'Anápolis' }],
  });
  await chamar(bruno, 'bruno', 'consultar', { tabela: 'produtos', campos: ['nome', 'custo'], limite: 2 });

  console.log('\n== 3. Limite com teto e nada de SQL livre');
  const r = await chamar(bruno, 'bruno', 'consultar', { tabela: 'pedidos', campos: ['id'], limite: 5000 });
  console.log(`  (pediu 5000, recebeu ${r.retornadas}; teto ${r.limite_aplicado})`);
  await chamar(bruno, 'bruno', 'consultar', { tabela: 'pedidos', filtros: [{ campo: 'id', op: 'LIKE', valor: '%' }] });

  console.log('\n== 4. Escrita em duas etapas');
  const prop = await chamar(ana, 'ana', 'propor_alteracao', { tabela: 'pedidos', id: 1001, alteracoes: { status: 'cancelado' } });
  await chamar(ana, 'ana', 'confirmar_alteracao', { token: prop.token });
  await chamar(ana, 'ana', 'confirmar_alteracao', { token: prop.token });
  await chamar(ana, 'ana', 'propor_alteracao', { tabela: 'pedidos', id: 1001, alteracoes: { total: 0 } });

  console.log('\n== 5. Trilha de auditoria (JSONL, sem valores)');
  console.log(readFileSync(arquivoAuditoria, 'utf8').trim());
} finally {
  await Promise.all([ana.close(), bruno.close(), carla.close()]);
  rmSync(dir, { recursive: true, force: true });
}
