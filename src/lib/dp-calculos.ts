/** Cálculos trabalhistas do Departamento Pessoal (tabelas vigentes em 2026). */

export const SALARIO_MINIMO = 1518;
const INSS_FAIXAS: Array<[number, number]> = [
  [1518.0, 0.075],
  [2793.88, 0.09],
  [4190.83, 0.12],
  [8157.41, 0.14],
];
const IRRF_FAIXAS: Array<[number, number, number]> = [
  [2428.8, 0, 0],
  [2826.65, 0.075, 182.16],
  [3751.05, 0.15, 394.16],
  [4664.68, 0.225, 675.49],
  [Infinity, 0.275, 908.73],
];
const DEDUCAO_DEPENDENTE = 189.59;
const DESCONTO_SIMPLIFICADO = 607.2;

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function calcularInss(base: number): number {
  let total = 0;
  let anterior = 0;
  for (const [teto, aliq] of INSS_FAIXAS) {
    if (base <= anterior) break;
    total += (Math.min(base, teto) - anterior) * aliq;
    anterior = teto;
  }
  return r2(total);
}

/** IRRF mensal com a redução da Lei 15.270/2025 (isenção até R$ 5.000). */
export function calcularIrrf(bruto: number, inss: number, dependentes: number): number {
  const legal = inss + dependentes * DEDUCAO_DEPENDENTE;
  const base = bruto - Math.max(legal, DESCONTO_SIMPLIFICADO);
  const faixa = IRRF_FAIXAS.find(([teto]) => base <= teto)!;
  let imposto = Math.max(0, base * faixa[1] - faixa[2]);
  if (bruto <= 5000) imposto = 0;
  else if (bruto <= 7350) imposto = Math.max(0, imposto - (978.62 - 0.133145 * bruto));
  return r2(imposto);
}

export interface ResumoPontoMes {
  diasTrabalhados: number;
  extraMin: number;
  noturnoMin: number;
  atrasoMin: number;
  faltas: number;
}

export interface DadosPagamento {
  salario: number;
  dependentes: number;
  vt_optante: boolean;
  vt_tarifa: number;
  vt_viagens_dia: number;
  va_valor_dia: number;
}

export function calcularVt(d: DadosPagamento, dias: number) {
  const custo = d.vt_optante ? r2(d.vt_tarifa * d.vt_viagens_dia * dias) : 0;
  const desconto = r2(Math.min(custo, d.salario * 0.06));
  return { dias, custo, desconto, empresa: r2(custo - desconto) };
}

export function calcularVa(d: DadosPagamento, dias: number) {
  return { dias, valor: r2(d.va_valor_dia * dias) };
}

export interface Rubrica { descricao: string; referencia: string; provento: number; desconto: number }

export function calcularFolha(d: DadosPagamento, p: ResumoPontoMes) {
  const hora = d.salario / 220;
  const extras = r2((p.extraMin / 60) * hora * 1.5);
  const dsrExtras = r2(extras / 6);
  const noturno = r2((p.noturnoMin / 60) * hora * 0.2);
  const faltas = r2((d.salario / 30) * p.faltas);
  const atrasos = r2((p.atrasoMin / 60) * hora);
  const vt = calcularVt(d, p.diasTrabalhados);
  const va = calcularVa(d, p.diasTrabalhados);
  const bruto = r2(d.salario + extras + dsrExtras + noturno - faltas - atrasos);
  const inss = calcularInss(bruto);
  const irrf = calcularIrrf(bruto, inss, d.dependentes);
  const fgts = r2(bruto * 0.08);
  const rubricas: Rubrica[] = [
    { descricao: "Salário base", referencia: "30 dias", provento: d.salario, desconto: 0 },
  ];
  const h = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  if (extras) rubricas.push({ descricao: "Horas extras 50%", referencia: h(p.extraMin), provento: extras, desconto: 0 });
  if (dsrExtras) rubricas.push({ descricao: "DSR sobre extras", referencia: "", provento: dsrExtras, desconto: 0 });
  if (noturno) rubricas.push({ descricao: "Adicional noturno 20%", referencia: h(p.noturnoMin), provento: noturno, desconto: 0 });
  if (faltas) rubricas.push({ descricao: "Faltas", referencia: `${p.faltas} dia(s)`, provento: 0, desconto: faltas });
  if (atrasos) rubricas.push({ descricao: "Atrasos", referencia: h(p.atrasoMin), provento: 0, desconto: atrasos });
  rubricas.push({ descricao: "INSS", referencia: "", provento: 0, desconto: inss });
  if (irrf) rubricas.push({ descricao: "IRRF", referencia: `${d.dependentes} dep.`, provento: 0, desconto: irrf });
  if (vt.desconto) rubricas.push({ descricao: "Vale transporte (6%)", referencia: `${vt.dias} dias`, provento: 0, desconto: vt.desconto });
  const proventos = r2(rubricas.reduce((s, r) => s + r.provento, 0));
  const descontos = r2(rubricas.reduce((s, r) => s + r.desconto, 0));
  return { rubricas, proventos, descontos, liquido: r2(proventos - descontos), bruto, inss, irrf, fgts, vt, va, ponto: p };
}
export type ResultadoFolha = ReturnType<typeof calcularFolha>;

export function calcularFerias(d: DadosPagamento, dias: number, abonoDias: number, mediaExtras = 0) {
  const base = d.salario + mediaExtras;
  const ferias = r2((base / 30) * dias);
  const terco = r2(ferias / 3);
  const abono = r2((base / 30) * abonoDias);
  const tercoAbono = r2(abono / 3);
  const inss = calcularInss(ferias + terco);
  const irrf = calcularIrrf(ferias + terco, inss, d.dependentes);
  const bruto = r2(ferias + terco + abono + tercoAbono);
  return { ferias, terco, abono, tercoAbono, inss, irrf, bruto, liquido: r2(bruto - inss - irrf) };
}

export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
