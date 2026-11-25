import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ErroGateway } from './erros.js';

export const esquemaProposta = z.object({
  tabela: z.string().min(1),
  id: z.number().int(),
  alteracoes: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .refine((o) => Object.keys(o).length > 0, 'informe ao menos um campo'),
});

export const esquemaConfirmacao = z.object({ token: z.string().min(1) });

/** Identificador curto e não reversível do token, para a auditoria ligar proposta e confirmação. */
export const idDoToken = (token) => createHash('sha256').update(token).digest('hex').slice(0, 12);

/** Propostas pendentes. O token só vale para a pessoa que propôs, uma vez, até expirar. */
export class Propostas {
  constructor({ validadeSegundos, agora }) {
    this.validadeMs = validadeSegundos * 1000;
    this.agora = agora;
    this.porToken = new Map();
  }

  criar({ pessoa, tabela, id, antes, depois }) {
    const token = randomBytes(24).toString('base64url');
    const expira = this.agora() + this.validadeMs;
    this.porToken.set(token, { pessoa, tabela, id, antes, depois, expira, usado: false });
    return { token, expira };
  }

  /** Valida o token para esta pessoa e o consome. Devolve a proposta. */
  consumir(pessoa, token) {
    const p = this.porToken.get(token);
    if (!p) throw new ErroGateway('token_invalido', 'Token inexistente');
    if (p.pessoa !== pessoa) throw new ErroGateway('token_de_outra_pessoa', 'Este token foi emitido para outra pessoa');
    if (p.usado) throw new ErroGateway('token_ja_usado', 'Este token já foi usado');
    if (this.agora() > p.expira) throw new ErroGateway('token_expirado', 'Token expirado: proponha a alteração de novo');
    p.usado = true;
    return p;
  }
}
