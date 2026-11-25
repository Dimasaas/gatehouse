import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ErroGateway } from './erros.js';

const texto = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const erro = (e) => ({
  isError: true,
  content: [{ type: 'text', text: e instanceof ErroGateway ? `${e.codigo}: ${e.message}` : 'erro_interno: falha inesperada' }],
});

/**
 * Cria o servidor MCP de uma pessoa. Quem fala com o gateway nunca informa a identidade:
 * ela é fixada na subida do processo (um processo = uma pessoa = um escopo).
 *
 * Os esquemas anunciados são propositalmente frouxos: a validação rígida é do gateway,
 * para que até uma entrada malformada deixe rastro na auditoria.
 */
export function criarServidor({ gateway, pessoa }) {
  const servidor = new McpServer({ name: 'guarita', version: '0.1.0' });
  const rodar = (fn) => async (entrada) => {
    try {
      return texto(fn(entrada));
    } catch (e) {
      return erro(e);
    }
  };

  servidor.registerTool(
    'listar_tabelas',
    { description: 'Lista as tabelas e os campos que o seu escopo enxerga (e quais campos são graváveis).', inputSchema: {} },
    rodar(() => gateway.listarTabelas(pessoa)),
  );

  servidor.registerTool(
    'consultar',
    {
      description:
        'Consulta somente leitura por DSL (não aceita SQL). Filtros são combinados com E. Operadores: =, !=, >, <, contem. O limite tem teto.',
      inputSchema: {
        tabela: z.string().describe('Nome da tabela, como em listar_tabelas'),
        campos: z.array(z.string()).optional().describe('Campos a devolver; padrão: todos do seu escopo'),
        filtros: z
          .array(z.object({ campo: z.string(), op: z.string().describe('=, !=, >, < ou contem'), valor: z.any() }))
          .optional(),
        limite: z.number().optional().describe('Máximo de linhas; é reduzido ao teto configurado'),
      },
    },
    rodar((e) => gateway.consultar(pessoa, e)),
  );

  servidor.registerTool(
    'propor_alteracao',
    {
      description:
        'Etapa 1 da escrita: NÃO grava. Devolve a prévia (antes e depois) e um token de validade curta. Mostre a prévia à pessoa e só confirme com o OK dela.',
      inputSchema: {
        tabela: z.string(),
        id: z.number().describe('Id do registro'),
        alteracoes: z.record(z.string(), z.any()).describe('{ campo: novoValor }, só campos graváveis'),
      },
    },
    rodar((e) => gateway.proporAlteracao(pessoa, e)),
  );

  servidor.registerTool(
    'confirmar_alteracao',
    {
      description:
        'Etapa 2 da escrita: aplica a alteração proposta. O token vale uma vez, só para quem propôs, e expira.',
      inputSchema: { token: z.string() },
    },
    rodar((e) => gateway.confirmarAlteracao(pessoa, e)),
  );

  return servidor;
}
