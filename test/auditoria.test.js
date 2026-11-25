import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Auditoria } from '../src/auditoria.js';
import { novoGateway } from './ajuda.js';

test('auditoria: uma linha JSONL por chamada, com quem, o quê, quando e o resultado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gatehouse-'));
  try {
    const caminho = join(dir, 'sub', 'auditoria.jsonl');
    const auditoria = new Auditoria({ caminho, agora: () => new Date('2026-03-01T12:00:00Z') });
    const gw = novoGateway({ auditoria });

    gw.consultar('ana_atendimento', {
      tabela: 'clientes',
      campos: ['id', 'nome'],
      filtros: [{ campo: 'nome', op: 'contem', valor: 'Marina' }],
      limite: 2,
    });
    assert.throws(() => gw.consultar('carla_estagio', { tabela: 'clientes' }));

    const linhas = readFileSync(caminho, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(linhas.length, 2);

    assert.deepEqual(linhas[0], {
      ts: '2026-03-01T12:00:00.000Z',
      pessoa: 'ana_atendimento',
      ferramenta: 'consultar',
      entrada: { tabela: 'clientes', campos: ['id', 'nome'], filtros: [{ campo: 'nome', op: 'contem' }], limite: 2 },
      resultado: 'ok',
      linhas: 1,
    });
    assert.equal(linhas[1].pessoa, 'carla_estagio');
    assert.equal(linhas[1].resultado, 'negado');
    assert.equal(linhas[1].codigo, 'tabela_desconhecida');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auditoria: não grava valores de filtro, de alteração nem dados devolvidos', () => {
  const gw = novoGateway();
  gw.consultar('ana_atendimento', {
    tabela: 'clientes',
    filtros: [{ campo: 'email', op: 'contem', valor: 'marina1@example.com' }],
  });
  const { token } = gw.proporAlteracao('ana_atendimento', {
    tabela: 'pedidos',
    id: 1002,
    alteracoes: { status: 'valor-sensivel-xyz' },
  });
  gw.confirmarAlteracao('ana_atendimento', { token });

  const tudo = gw.auditoria.linhas.join('\n');
  for (const proibido of ['marina1@example.com', 'Marina Albuquerque', 'valor-sensivel-xyz', token]) {
    assert.ok(!tudo.includes(proibido), `vazou: ${proibido}`);
  }
  const [, propor, confirmar] = gw.auditoria.linhas.map((l) => JSON.parse(l));
  assert.deepEqual(propor.entrada, { tabela: 'pedidos', id: 1002, campos: ['status'] });
  assert.equal(propor.token_id, confirmar.entrada.token_id, 'proposta e confirmação se ligam pelo id do token');
});

test('auditoria: registra recusas de token com o código', () => {
  const gw = novoGateway();
  const { token } = gw.proporAlteracao('ana_atendimento', { tabela: 'pedidos', id: 1003, alteracoes: { status: 'pago' } });
  assert.throws(() => gw.confirmarAlteracao('bruno_analise', { token }));
  gw.confirmarAlteracao('ana_atendimento', { token });
  assert.throws(() => gw.confirmarAlteracao('ana_atendimento', { token }));

  const l = gw.auditoria.linhas.map((x) => JSON.parse(x));
  assert.deepEqual(
    l.map((x) => x.codigo ?? x.resultado),
    ['ok', 'token_de_outra_pessoa', 'ok', 'token_ja_usado'],
  );
  assert.equal(l[1].pessoa, 'bruno_analise');
});

test('auditoria: entrada malformada vira entrada_invalida e também é registrada', () => {
  const gw = novoGateway();
  assert.throws(() => gw.consultar('ana_atendimento', { tabela: 'pedidos', limite: -5 }), { codigo: 'entrada_invalida' });
  const l = JSON.parse(gw.auditoria.linhas.at(-1));
  assert.equal(l.resultado, 'negado');
  assert.equal(l.codigo, 'entrada_invalida');
});
