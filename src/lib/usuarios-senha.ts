export function traduzirErroSenha(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (
    m.includes("weak") ||
    m.includes("easy to guess") ||
    m.includes("pwned") ||
    m.includes("leaked")
  ) {
    return "Esta senha é considerada fraca ou já apareceu em vazamentos. Escolha outra senha, com pelo menos 8 caracteres, misturando letras, números e símbolos.";
  }
  if (m.includes("should be at least") || m.includes("password should be")) {
    return "A senha é curta demais. Use pelo menos 8 caracteres.";
  }
  return mensagem;
}
