import test from 'node:test';
import assert from 'node:assert/strict';
import { novoGateway } from './ajuda.js';

function comRelogio() {
  const relogio = { t: 1_800_000_000_000 };
  return { relogio, gw: novoGateway({ agora: () => relogio.t }) };
}
const pedido = (gw, id = 1001) =>
  gw.consultar('ana_atendimento', { tabela: 'pedidos', filtros: [{ campo: 'id', op: '=', valor: id }] }).linhas[0];
const propor = (gw, pessoa = 'ana_atendimento', id = 1001, status = 'cancelado') =>
  gw.proporAlteracao(pessoa, { tabela: 'pedidos', id, alteracoes: { status } });

test('propor devolve prévia (antes e depois) e token, mas não grava nada', () => {
  const { gw } = comRelogio();
  const antes = pedido(gw).status;
  const r = propor(gw);
  assert.deepEqual(r.previa, { tabela: 'pedidos', id: 1001, antes: { status: antes }, depois: { status: 'cancelado' } });
  assert.ok(r.token.length >= 32);
  assert.equal(pedido(gw).status, antes);
});

test('confirmar com token válido aplica a alteração', () => {
  const { gw } = comRelogio();
  const { token } = propor(gw);
  const r = gw.confirmarAlteracao('ana_atendimento', { token });
  assert.equal(r.aplicado, true);
  assert.equal(pedido(gw).status, 'cancelado');
});

test('token expirado não executa', () => {
  const { gw, relogio } = comRelogio();
  const antes = pedido(gw).status;
  const { token } = propor(gw);
  relogio.t += 121 * 1000; // validade configurada: 120 s
  assert.throws(() => gw.confirmarAlteracao('ana_atendimento', { token }), { codigo: 'token_expirado' });
  assert.equal(pedido(gw).status, antes);
});

test('token ainda vale no último segundo da validade', () => {
  const { gw, relogio } = comRelogio();
  const { token } = propor(gw);
  relogio.t += 120 * 1000;
  assert.equal(gw.confirmarAlteracao('ana_atendimento', { token }).aplicado, true);
});

test('token de outra pessoa é recusado e continua válido para o dono', () => {
  const { gw } = comRelogio();
  const antes = pedido(gw).status;
  const { token } = propor(gw);
  assert.throws(() => gw.confirmarAlteracao('bruno_analise', { token }), { codigo: 'token_de_outra_pessoa' });
  assert.equal(pedido(gw).status, antes);
  assert.equal(gw.confirmarAlteracao('ana_atendimento', { token }).aplicado, true);
});

test('token reusado é recusado', () => {
  const { gw } = comRelogio();
  const { token } = propor(gw);
  gw.confirmarAlteracao('ana_atendimento', { token });
  assert.throws(() => gw.confirmarAlteracao('ana_atendimento', { token }), { codigo: 'token_ja_usado' });
});

test('token inventado é recusado', () => {
  const { gw } = comRelogio();
  assert.throws(() => gw.confirmarAlteracao('ana_atendimento', { token: 'inventado' }), { codigo: 'token_invalido' });
});

test('só altera campo marcado como gravável no escopo', () => {
  const { gw } = comRelogio();
  const prop = (pessoa, tabela, alteracoes) => () => gw.proporAlteracao(pessoa, { tabela, id: 1, alteracoes });
  assert.throws(prop('ana_atendimento', 'pedidos', { total: 0 }), { codigo: 'campo_nao_gravavel' });
  assert.throws(prop('ana_atendimento', 'clientes', { nome: 'x' }), { codigo: 'campo_nao_gravavel' });
  assert.throws(prop('ana_atendimento', 'clientes', { observacao_interna: 'x' }), { codigo: 'campo_desconhecido' });
  assert.throws(prop('bruno_analise', 'pedidos', { status: 'pago' }), { codigo: 'campo_nao_gravavel' });
  assert.throws(prop('carla_estagio', 'pedidos', { status: 'pago' }), { codigo: 'tabela_desconhecida' });
});

test('registro inexistente e tipo errado são recusados', () => {
  const { gw } = comRelogio();
  assert.throws(() => propor(gw, 'ana_atendimento', 424242), { codigo: 'registro_nao_encontrado' });
  assert.throws(
    () => gw.proporAlteracao('ana_atendimento', { tabela: 'pedidos', id: 1001, alteracoes: { status: 7 } }),
    { codigo: 'tipo_invalido' },
  );
});

test('se o registro mudou entre propor e confirmar, nada é gravado', () => {
  const { gw } = comRelogio();
  const a = propor(gw, 'ana_atendimento', 1001, 'cancelado');
  const b = propor(gw, 'ana_atendimento', 1001, 'enviado');
  gw.confirmarAlteracao('ana_atendimento', { token: b.token });
  assert.throws(() => gw.confirmarAlteracao('ana_atendimento', { token: a.token }), { codigo: 'registro_mudou' });
  assert.equal(pedido(gw).status, 'enviado');
});
