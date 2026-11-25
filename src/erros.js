/** Erro de regra do gateway: tem um código estável para a auditoria e para o agente. */
export class ErroGateway extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroGateway';
    this.codigo = codigo;
  }
}
