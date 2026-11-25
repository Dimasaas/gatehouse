import { readFileSync } from 'node:fs';
import { z } from 'zod';

const escopoTabela = z.object({
  campos: z.array(z.string().min(1)).min(1),
  gravaveis: z.array(z.string().min(1)).default([]),
});

const esquemaConfig = z.object({
  limite_padrao: z.number().int().positive().default(10),
  limite_maximo: z.number().int().positive().default(50),
  validade_token_segundos: z.number().int().positive().default(120),
  pessoas: z.record(z.string().min(1), z.object({ tabelas: z.record(z.string().min(1), escopoTabela) })),
});

/**
 * Valida e normaliza o arquivo de escopos.
 * Regra de ouro: um campo gravável precisa ser, antes, um campo visível.
 */
export function validarConfig(bruto) {
  const cfg = esquemaConfig.parse(bruto);
  if (cfg.limite_padrao > cfg.limite_maximo) {
    throw new Error('limite_padrao não pode passar de limite_maximo');
  }
  for (const [pessoa, { tabelas }] of Object.entries(cfg.pessoas)) {
    for (const [tabela, esc] of Object.entries(tabelas)) {
      for (const campo of esc.gravaveis) {
        if (!esc.campos.includes(campo)) {
          throw new Error(`${pessoa}.${tabela}: campo gravável "${campo}" não está entre os campos visíveis`);
        }
      }
    }
  }
  return cfg;
}

export function carregarConfig(caminho) {
  return validarConfig(JSON.parse(readFileSync(caminho, 'utf8')));
}
