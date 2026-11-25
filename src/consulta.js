import { z } from 'zod';
import { ErroGateway } from './erros.js';

export const OPERADORES = ['=', '!=', '>', '<', 'contem'];

export const esquemaConsulta = z.object({
  tabela: z.string().min(1),
  campos: z.array(z.string().min(1)).optional(),
  filtros: z
    .array(
      z.object({
        campo: z.string().min(1),
        op: z.enum(OPERADORES),
        valor: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .max(10)
    .default([]),
  limite: z.number().int().positive().optional(),
});

function compara(op, atual, valor) {
  switch (op) {
    case '=':
      return atual === valor;
    case '!=':
      return atual !== valor;
    case 'contem':
      return typeof atual === 'string' && typeof valor === 'string' && atual.toLowerCase().includes(valor.toLowerCase());
    case '>':
    case '<': {
      if (typeof atual !== typeof valor || (typeof atual !== 'number' && typeof atual !== 'string')) return false;
      return op === '>' ? atual > valor : atual < valor;
    }
    default:
      return false;
  }
}

/**
 * Executa a DSL dentro do escopo da pessoa.
 * `escopoTabela` é { campos: [...] } — ou undefined, se a pessoa não enxerga a tabela.
 * Um nome fora do escopo recebe o MESMO erro de um nome que não existe.
 */
export function executarConsulta({ banco, escopoTabela, cfg, entrada }) {
  const dsl = esquemaConsulta.parse(entrada);
  if (!escopoTabela || !banco.existe(dsl.tabela)) {
    throw new ErroGateway('tabela_desconhecida', `Tabela desconhecida: ${dsl.tabela}`);
  }
  const visiveis = escopoTabela.campos;
  const checar = (campo) => {
    if (!visiveis.includes(campo)) {
      throw new ErroGateway('campo_desconhecido', `Campo desconhecido em ${dsl.tabela}: ${campo}`);
    }
  };
  const campos = dsl.campos ?? visiveis;
  campos.forEach(checar);
  dsl.filtros.forEach((f) => checar(f.campo));

  const pedido = dsl.limite ?? cfg.limite_padrao;
  const limiteAplicado = Math.min(pedido, cfg.limite_maximo);

  const correspondentes = banco
    .linhas(dsl.tabela)
    .filter((linha) => dsl.filtros.every((f) => compara(f.op, linha[f.campo], f.valor)));

  const linhas = correspondentes.slice(0, limiteAplicado).map((linha) => {
    const saida = {};
    for (const c of campos) saida[c] = linha[c];
    return saida;
  });

  return {
    tabela: dsl.tabela,
    campos,
    total_correspondente: correspondentes.length,
    retornadas: linhas.length,
    limite_aplicado: limiteAplicado,
    limite_reduzido: pedido > cfg.limite_maximo,
    linhas,
  };
}
