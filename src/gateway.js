import { Banco } from './banco.js';
import { executarConsulta } from './consulta.js';
import { ErroGateway } from './erros.js';

/** O coração do projeto: aplica o escopo da pessoa a cada pedido. Sem rede, sem MCP — só regra. */
export class Gateway {
  constructor({ banco, config }) {
    this.banco = banco instanceof Banco ? banco : new Banco(banco);
    this.cfg = config;
  }

  escopoDe(pessoa) {
    const p = Object.hasOwn(this.cfg.pessoas, pessoa) ? this.cfg.pessoas[pessoa] : undefined;
    if (!p) throw new ErroGateway('pessoa_desconhecida', `Pessoa sem escopo configurado: ${pessoa}`);
    return p;
  }

  listarTabelas(pessoa) {
    const { tabelas } = this.escopoDe(pessoa);
    return Object.entries(tabelas)
      .filter(([nome]) => this.banco.existe(nome))
      .map(([nome, esc]) => {
        const tipos = this.banco.tipos(nome);
        return {
          tabela: nome,
          campos: esc.campos.map((c) => ({ nome: c, tipo: tipos[c] ?? 'desconhecido' })),
          gravaveis: esc.gravaveis,
        };
      });
  }

  consultar(pessoa, entrada) {
    const { tabelas } = this.escopoDe(pessoa);
    const tabela = typeof entrada?.tabela === 'string' ? entrada.tabela : undefined;
    const escopoTabela = tabela && Object.hasOwn(tabelas, tabela) ? tabelas[tabela] : undefined;
    return executarConsulta({ banco: this.banco, escopoTabela, cfg: this.cfg, entrada });
  }
}
