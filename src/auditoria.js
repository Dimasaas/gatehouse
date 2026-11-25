import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Trilha de auditoria em JSONL: uma linha por chamada, com quem, o quê, quando e o resultado.
 * Nunca recebe valores de filtro, de alteração nem linhas devolvidas — só nomes de campos e contagens.
 * Sem `caminho`, guarda as linhas em memória (útil em testes e na demo).
 */
export class Auditoria {
  constructor({ caminho = null, agora = () => new Date() } = {}) {
    this.caminho = caminho;
    this.agora = agora;
    this.linhas = [];
    if (caminho) mkdirSync(dirname(caminho), { recursive: true });
  }

  registrar(evento) {
    const linha = JSON.stringify({ ts: this.agora().toISOString(), ...evento });
    this.linhas.push(linha);
    if (this.caminho) appendFileSync(this.caminho, linha + '\n', 'utf8');
    return linha;
  }
}
