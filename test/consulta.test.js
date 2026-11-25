import test from 'node:test';
import assert from 'node:assert/strict';
import { novoGateway } from './ajuda.js';
import { validarConfig } from '../src/config.js';

test('escopo: cada pessoa só enxerga as tabelas do seu escopo', () => {
  const gw = novoGateway();
  assert.deepEqual(gw.listarTabelas('carla_estagio').map((t) => t.tabela), ['produtos']);
  assert.deepEqual(gw.listarTabelas('ana_atendimento').map((t) => t.tabela), ['clientes', 'pedidos', 'produtos']);
  assert.throws(() => gw.consultar('carla_estagio', { tabela: 'clientes' }), { codigo: 'tabela_desconhecida' });
});

test('escopo: tabela fora do escopo recebe o mesmo erro de tabela inexistente', () => {
  const gw = novoGateway();
  const msg = (t) => {
    try {
      gw.consultar('carla_estagio', { tabela: t });
    } catch (e) {
      return e.message.replace(t, '#');
    }
  };
  assert.equal(msg('clientes'), msg('nao_existe'));
});

test('campo oculto: não aparece no esquema, nem no resultado, nem como filtro', () => {
  const gw = novoGateway();
  const esquema = gw.listarTabelas('ana_atendimento').find((t) => t.tabela === 'clientes');
  assert.deepEqual(esquema.campos.map((c) => c.nome), ['id', 'nome', 'email', 'cidade']);
  assert.ok(!JSON.stringify(esquema).includes('observacao_interna'));

  const r = gw.consultar('ana_atendimento', { tabela: 'clientes' });
  for (const linha of r.linhas) assert.deepEqual(Object.keys(linha), ['id', 'nome', 'email', 'cidade']);

  assert.throws(() => gw.consultar('ana_atendimento', { tabela: 'clientes', campos: ['observacao_interna'] }), {
    codigo: 'campo_desconhecido',
  });
  // filtrar por campo oculto deixaria adivinhar o valor: também é recusado
  assert.throws(
    () =>
      gw.consultar('ana_atendimento', {
        tabela: 'clientes',
        filtros: [{ campo: 'observacao_interna', op: 'contem', valor: 'desconto' }],
      }),
    { codigo: 'campo_desconhecido' },
  );
});

test('o custo do produto só aparece para quem tem o campo no escopo', () => {
  const gw = novoGateway();
  assert.ok(!('custo' in gw.consultar('ana_atendimento', { tabela: 'produtos' }).linhas[0]));
  assert.ok('custo' in gw.consultar('bruno_analise', { tabela: 'produtos' }).linhas[0]);
});

test('limite: usa o padrão e nunca passa do teto', () => {
  const gw = novoGateway();
  const padrao = gw.consultar('bruno_analise', { tabela: 'pedidos' });
  assert.equal(padrao.limite_aplicado, 10);
  assert.equal(padrao.retornadas, 10);
  assert.equal(padrao.total_correspondente, 24);

  const alto = gw.consultar('bruno_analise', { tabela: 'pedidos', limite: 1000 });
  assert.equal(alto.limite_aplicado, 20);
  assert.equal(alto.retornadas, 20);
  assert.equal(alto.limite_reduzido, true);

  assert.equal(gw.consultar('bruno_analise', { tabela: 'pedidos', limite: 3 }).retornadas, 3);
});

test('filtros: =, !=, >, < e contem', () => {
  const gw = novoGateway();
  const q = (filtros, tabela = 'pedidos') => gw.consultar('bruno_analise', { tabela, filtros, limite: 20 });

  assert.ok(q([{ campo: 'status', op: '=', valor: 'pago' }]).linhas.every((l) => l.status === 'pago'));
  assert.ok(q([{ campo: 'status', op: '!=', valor: 'pago' }]).linhas.every((l) => l.status !== 'pago'));
  assert.ok(q([{ campo: 'total', op: '>', valor: 200 }]).linhas.every((l) => l.total > 200));
  assert.ok(q([{ campo: 'total', op: '<', valor: 50 }]).linhas.every((l) => l.total < 50));
  assert.ok(q([{ campo: 'criado_em', op: '>', valor: '2026-05-01' }]).linhas.length > 0);

  const c = q([{ campo: 'nome', op: 'contem', valor: 'CANECA' }], 'produtos');
  assert.deepEqual(c.linhas.map((l) => l.nome), ['Caneca de cerâmica']);

  const dois = q([
    { campo: 'status', op: '=', valor: 'pago' },
    { campo: 'total', op: '>', valor: 100 },
  ]);
  assert.ok(dois.linhas.length > 0);
  assert.ok(dois.linhas.every((l) => l.status === 'pago' && l.total > 100));
});

test('DSL: não aceita SQL livre nem operador desconhecido', () => {
  const gw = novoGateway();
  assert.throws(() => gw.consultar('bruno_analise', { tabela: 'pedidos; DROP TABLE pedidos' }), {
    codigo: 'tabela_desconhecida',
  });
  assert.throws(() =>
    gw.consultar('bruno_analise', { tabela: 'pedidos', filtros: [{ campo: 'id', op: 'LIKE', valor: '%' }] }),
  );
  // chave estranha (ex.: "sql") não é executada: a DSL só conhece tabela, campos, filtros e limite
  const r = gw.consultar('bruno_analise', { tabela: 'pedidos', sql: 'DROP TABLE pedidos', limite: 1 });
  assert.equal(r.retornadas, 1);
  assert.equal(gw.consultar('bruno_analise', { tabela: 'pedidos' }).total_correspondente, 24);
});

test('config: campo gravável precisa ser visível', () => {
  assert.throws(() => validarConfig({ pessoas: { x: { tabelas: { t: { campos: ['a'], gravaveis: ['b'] } } } } }));
});

test('pessoa sem escopo é recusada', () => {
  assert.throws(() => novoGateway().consultar('intruso', { tabela: 'produtos' }), { codigo: 'pessoa_desconhecida' });
  assert.throws(() => novoGateway().listarTabelas('constructor'), { codigo: 'pessoa_desconhecida' });
});
