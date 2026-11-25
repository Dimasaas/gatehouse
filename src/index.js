#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auditoria } from './auditoria.js';
import { Banco } from './banco.js';
import { carregarConfig } from './config.js';
import { Gateway } from './gateway.js';
import { criarServidor } from './servidor.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const env = process.env;

const pessoa = env.MCP_PESSOA;
if (!pessoa) {
  console.error('Defina MCP_PESSOA (a pessoa cujo escopo este processo vai usar).');
  process.exit(1);
}

const config = carregarConfig(env.MCP_ESCOPOS ?? resolve(raiz, 'exemplos/escopos.json'));
const banco = Banco.deArquivo(env.MCP_DADOS ?? resolve(raiz, 'exemplos/dados.json'));
const auditoria = new Auditoria({ caminho: resolve(env.MCP_AUDITORIA ?? 'auditoria.jsonl') });
const gateway = new Gateway({ banco, config, auditoria });
gateway.escopoDe(pessoa); // falha cedo se a pessoa não existe

await criarServidor({ gateway, pessoa }).connect(new StdioServerTransport());
console.error(`guarita pronto para ${pessoa}`); // stderr: stdout é do protocolo
