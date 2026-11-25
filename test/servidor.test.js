import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entrada = fileURLToPath(new URL('../src/index.js', import.meta.url));

async function conectar(pessoa, auditoria) {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [entrada],
    env: { ...process.env, MCP_PESSOA: pessoa, MCP_AUDITORIA: auditoria },
    stderr: 'ignore',
  });
  const cliente = new Client({ name: 'teste', version: '1.0.0' });
  await cliente.connect(transporte);
  return cliente;
}
const json = (r) => JSON.parse(r.content[0].text);

test('servidor stdio: ferramentas, escopo e escrita em duas etapas de ponta a ponta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guarita-'));
  const caminho = join(dir, 'auditoria.jsonl');
  const cliente = await conectar('ana_atendimento', caminho);
  try {
    const { tools } = await cliente.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ['confirmar_alteracao', 'consultar', 'listar_tabelas', 'propor_alteracao'],
    );

    const esquema = json(await cliente.callTool({ name: 'listar_tabelas', arguments: {} }));
    assert.ok(!JSON.stringify(esquema).includes('custo'));

    const oculto = await cliente.callTool({ name: 'consultar', arguments: { tabela: 'clientes', campos: ['observacao_interna'] } });
    assert.equal(oculto.isError, true);
    assert.match(oculto.content[0].text, /campo_desconhecido/);

    const prop = json(
      await cliente.callTool({
        name: 'propor_alteracao',
        arguments: { tabela: 'pedidos', id: 1001, alteracoes: { status: 'cancelado' } },
      }),
    );
    assert.equal(prop.previa.depois.status, 'cancelado');
    const conf = json(await cliente.callTool({ name: 'confirmar_alteracao', arguments: { token: prop.token } }));
    assert.equal(conf.aplicado, true);

    const sql = await cliente.callTool({ name: 'consultar', arguments: { tabela: 'pedidos', filtros: [{ campo: 'id', op: 'LIKE', valor: '%' }] } });
    assert.equal(sql.isError, true);

    const linhas = readFileSync(caminho, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(
      linhas.map((l) => [l.ferramenta, l.resultado]),
      [
        ['listar_tabelas', 'ok'],
        ['consultar', 'negado'],
        ['propor_alteracao', 'ok'],
        ['confirmar_alteracao', 'ok'],
        ['consultar', 'negado'],
      ],
    );
  } finally {
    await cliente.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('servidor stdio: pessoa desconhecida não sobe', async () => {
  await assert.rejects(conectar('intruso', join(tmpdir(), 'guarita-nunca.jsonl')));
});
