import { readFileSync } from 'node:fs';
import { Banco } from '../src/banco.js';
import { validarConfig } from '../src/config.js';
import { Gateway } from '../src/gateway.js';

const lerJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

export function novoGateway(extra = {}) {
  const config = validarConfig(lerJson('../exemplos/escopos.json'));
  return new Gateway({ banco: new Banco(lerJson('../exemplos/dados.json')), config, ...extra });
}
