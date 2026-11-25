import { readFileSync } from 'node:fs';

/** Banco fictício em memória: { tabela: [linha, ...] }. Toda linha tem `id`. */
export class Banco {
  constructor(dados) {
    this.tabelas = structuredClone(dados);
  }

  static deArquivo(caminho) {
    return new Banco(JSON.parse(readFileSync(caminho, 'utf8')));
  }

  existe(tabela) {
    return Object.hasOwn(this.tabelas, tabela);
  }

  linhas(tabela) {
    return this.tabelas[tabela] ?? [];
  }

  porId(tabela, id) {
    return this.linhas(tabela).find((l) => l.id === id);
  }

  /** Campos conhecidos da tabela e o tipo de cada um (lido da primeira linha). */
  tipos(tabela) {
    const primeira = this.linhas(tabela)[0] ?? {};
    return Object.fromEntries(Object.entries(primeira).map(([k, v]) => [k, typeof v]));
  }
}
