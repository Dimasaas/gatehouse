import { ZodError } from 'zod';
import { Auditoria } from './auditoria.js';
import { Banco } from './banco.js';
import { executarConsulta } from './consulta.js';
import { ErroGateway } from './erros.js';
import { esquemaConfirmacao, esquemaProposta, idDoToken, Propostas } from './escrita.js';

const nomes = (x) => (Array.isArray(x) ? x.filter((c) => typeof c === 'string') : undefined);

/**
 * O coração do projeto: aplica o escopo da pessoa a cada pedido e audita todos.
 * Sem rede, sem MCP — só regra. `agora` (ms) é injetável para testar validade de token.
 */
export class Gateway {
  constructor({ banco, config, auditoria = new Auditoria(), agora = () => Date.now() }) {
    this.banco = banco instanceof Banco ? banco : new Banco(banco);
    this.cfg = config;
    this.auditoria = auditoria;
    this.agora = agora;
    this.propostas = new Propostas({ validadeSegundos: config.validade_token_segundos, agora });
  }

  /** Roda `fn`, registra o resultado (sem valores) e converte erros de entrada em ErroGateway. */
  #auditar(pessoa, ferramenta, entrada, fn) {
    const base = { pessoa, ferramenta, entrada };
    try {
      const { resposta, detalhe } = fn();
      this.auditoria.registrar({ ...base, resultado: 'ok', ...detalhe });
      return resposta;
    } catch (e) {
      const erro = e instanceof ZodError ? new ErroGateway('entrada_invalida', 'Entrada fora do formato esperado') : e;
      this.auditoria.registrar({
        ...base,
        resultado: erro instanceof ErroGateway ? 'negado' : 'erro',
        codigo: erro instanceof ErroGateway ? erro.codigo : 'erro_interno',
      });
      throw erro;
    }
  }

  escopoDe(pessoa) {
    const p = Object.hasOwn(this.cfg.pessoas, pessoa) ? this.cfg.pessoas[pessoa] : undefined;
    if (!p) throw new ErroGateway('pessoa_desconhecida', `Pessoa sem escopo configurado: ${pessoa}`);
    return p;
  }

  escopoDaTabela(pessoa, tabela) {
    const { tabelas } = this.escopoDe(pessoa);
    return typeof tabela === 'string' && Object.hasOwn(tabelas, tabela) && this.banco.existe(tabela)
      ? tabelas[tabela]
      : undefined;
  }

  listarTabelas(pessoa) {
    return this.#auditar(pessoa, 'listar_tabelas', {}, () => {
      const { tabelas } = this.escopoDe(pessoa);
      const resposta = Object.entries(tabelas)
        .filter(([nome]) => this.banco.existe(nome))
        .map(([nome, esc]) => {
          const tipos = this.banco.tipos(nome);
          return {
            tabela: nome,
            campos: esc.campos.map((c) => ({ nome: c, tipo: tipos[c] ?? 'desconhecido' })),
            gravaveis: esc.gravaveis,
          };
        });
      return { resposta, detalhe: { linhas: resposta.length } };
    });
  }

  consultar(pessoa, entrada) {
    const resumo = {
      tabela: typeof entrada?.tabela === 'string' ? entrada.tabela : null,
      campos: nomes(entrada?.campos),
      filtros: Array.isArray(entrada?.filtros)
        ? entrada.filtros.map((f) => ({ campo: String(f?.campo), op: String(f?.op) }))
        : [],
      limite: typeof entrada?.limite === 'number' ? entrada.limite : undefined,
    };
    return this.#auditar(pessoa, 'consultar', resumo, () => {
      this.escopoDe(pessoa);
      const escopoTabela = this.escopoDaTabela(pessoa, entrada?.tabela);
      const resposta = executarConsulta({ banco: this.banco, escopoTabela, cfg: this.cfg, entrada });
      return { resposta, detalhe: { linhas: resposta.retornadas } };
    });
  }

  proporAlteracao(pessoa, entrada) {
    const resumo = {
      tabela: typeof entrada?.tabela === 'string' ? entrada.tabela : null,
      id: typeof entrada?.id === 'number' ? entrada.id : null,
      campos: entrada?.alteracoes && typeof entrada.alteracoes === 'object' ? Object.keys(entrada.alteracoes) : [],
    };
    return this.#auditar(pessoa, 'propor_alteracao', resumo, () => {
      const { tabela, id, alteracoes } = esquemaProposta.parse(entrada);
      const esc = this.escopoDaTabela(pessoa, tabela);
      if (!esc) throw new ErroGateway('tabela_desconhecida', `Tabela desconhecida: ${tabela}`);

      for (const campo of Object.keys(alteracoes)) {
        if (!esc.campos.includes(campo)) {
          throw new ErroGateway('campo_desconhecido', `Campo desconhecido em ${tabela}: ${campo}`);
        }
        if (!esc.gravaveis.includes(campo)) {
          throw new ErroGateway('campo_nao_gravavel', `Seu escopo não permite alterar ${tabela}.${campo}`);
        }
      }
      const linha = this.banco.porId(tabela, id);
      if (!linha) throw new ErroGateway('registro_nao_encontrado', `Registro ${id} não encontrado em ${tabela}`);

      const antes = {};
      const depois = {};
      for (const [campo, valor] of Object.entries(alteracoes)) {
        if (valor !== null && typeof valor !== typeof linha[campo]) {
          throw new ErroGateway('tipo_invalido', `${campo} espera ${typeof linha[campo]}`);
        }
        antes[campo] = linha[campo];
        depois[campo] = valor;
      }

      const { token, expira } = this.propostas.criar({ pessoa, tabela, id, antes, depois });
      return {
        resposta: {
          token,
          expira_em: new Date(expira).toISOString(),
          validade_segundos: this.cfg.validade_token_segundos,
          previa: { tabela, id, antes, depois },
          aviso: 'Nada foi gravado. Chame confirmar_alteracao com este token para aplicar.',
        },
        detalhe: { token_id: idDoToken(token) },
      };
    });
  }

  confirmarAlteracao(pessoa, entrada) {
    const token = typeof entrada?.token === 'string' ? entrada.token : '';
    return this.#auditar(pessoa, 'confirmar_alteracao', { token_id: token ? idDoToken(token) : null }, () => {
      this.escopoDe(pessoa);
      esquemaConfirmacao.parse(entrada);
      const p = this.propostas.consumir(pessoa, token);
      const linha = this.banco.porId(p.tabela, p.id);
      const mudou = !linha || Object.entries(p.antes).some(([c, v]) => linha[c] !== v);
      if (mudou) throw new ErroGateway('registro_mudou', 'O registro mudou desde a proposta: proponha de novo');
      Object.assign(linha, p.depois);
      return {
        resposta: { aplicado: true, tabela: p.tabela, id: p.id, antes: p.antes, depois: p.depois },
        detalhe: { linhas: 1, tabela: p.tabela },
      };
    });
  }
}
