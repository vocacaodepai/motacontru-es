// Importação de planilhas (CSV): funcionários e fornecedores. Sempre com prévia: nada é gravado até confirmar.
import { tx, one } from './db.js';
import { ErroNegocio } from './services.js';
import * as DP from './dp.js';
import * as MT from './materiais.js';

export function lerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] || '';
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let cel = '', lin = [], asp = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (asp) { if (c === '"' && t[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') asp = false; else cel += c; }
    else if (c === '"') asp = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; lin.push(cel); cel = ''; if (lin.some((x) => x.trim())) linhas.push(lin); lin = []; }
    else cel += c;
  }
  lin.push(cel); if (lin.some((x) => x.trim())) linhas.push(lin);
  return linhas.map((l) => l.map((x) => x.trim()));
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const dataIso = (v) => { const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v; };
const reais = (v) => { const s = String(v ?? '').replace(/[R$\s]/g, ''); if (!s) return 0; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

export const TIPOS = {
  funcionarios: {
    titulo: 'Funcionários', modelo: ['nome', 'cpf', 'funcao', 'telefone', 'data_admissao', 'diaria'],
    exemplo: [['João da Silva', '', 'pedreiro', '(21) 99999-0000', '01/03/2026', '220,00']],
    aliases: { funcao_obra: 'funcao', cargo: 'funcao', valor_diaria: 'diaria', admissao: 'data_admissao' },
    duplicado: async (r) => { const c = String(r.cpf || '').replace(/\D/g, ''); return c && (await one('SELECT 1 AS x FROM funcionarios WHERE cpf = $1', [c])) ? 'CPF já cadastrado.' : null; },
    gravar: (r) => DP.salvar(null, { nome: r.nome, cpf: r.cpf, funcao_obra: r.funcao || 'servente', cargo: r.funcao, telefone: r.telefone, data_admissao: dataIso(r.data_admissao), valor_diaria: reais(r.diaria), grupo: 'funcionario', regime: r.diaria ? 'diarista' : 'clt', vinculo: r.diaria ? 'informal' : 'mota', ativo: 1 }),
  },
  fornecedores: {
    titulo: 'Fornecedores', modelo: ['nome', 'cnpj', 'categoria', 'contato', 'telefone', 'email', 'prazo_dias'],
    exemplo: [['Depósito Exemplo Ltda', '', 'Material básico', 'Carlos', '(21) 3333-0000', 'vendas@exemplo.com', '2']],
    aliases: {},
    duplicado: async (r) => ((await one('SELECT 1 AS x FROM fornecedores WHERE lower(nome) = lower($1)', [r.nome])) ? 'Já existe um fornecedor com este nome.' : null),
    gravar: (r) => MT.salvarFornecedor(null, r),
  },
};
export const modeloCsv = (tipo) => { const t = TIPOS[tipo]; if (!t) throw new ErroNegocio('Tipo de planilha inválido.', 404); return '﻿' + [t.modelo, ...t.exemplo].map((l) => l.join(';')).join('\r\n') + '\r\n'; };

class Reverter extends Error {}
// confirmar=false: valida tudo e desfaz; confirmar=true: grava apenas se TODAS as linhas forem válidas
export async function processar(tipo, csv, confirmar) {
  const t = TIPOS[tipo];
  if (!t) throw new ErroNegocio('Tipo de planilha inválido.', 404);
  const tab = lerCsv(csv);
  if (tab.length < 2) throw new ErroNegocio('A planilha precisa de uma linha de títulos e ao menos uma linha de dados.');
  if (tab.length > 501) throw new ErroNegocio('Máximo de 500 linhas por importação.');
  const cab = tab[0].map((c) => { const n = norm(c); return t.aliases[n] || n; });
  if (!cab.includes('nome')) throw new ErroNegocio('Não achei a coluna "nome". Baixe o modelo e use os mesmos títulos.');
  const desconhecidas = cab.filter((c) => c && !t.modelo.includes(c));
  const linhas = tab.slice(1).map((l, i) => ({ n: i + 2, dados: Object.fromEntries(cab.map((c, k) => [c, l[k] ?? ''])) }));
  const resultado = [];
  const rodar = async () => { for (const l of linhas) {
    if (!l.dados.nome) { resultado.push({ n: l.n, ok: false, nome: '', erro: 'Nome em branco.' }); continue; }
    try { const dup = await t.duplicado(l.dados); if (dup) throw new ErroNegocio(dup); await tx(async () => { await t.gravar(l.dados); }); resultado.push({ n: l.n, ok: true, nome: l.dados.nome }); }
    catch (e) { resultado.push({ n: l.n, ok: false, nome: l.dados.nome, erro: e.status && e.status < 500 ? e.message : e.message || 'Erro' }); }
  } };
  // cada linha usa tx aninhada; o conjunto roda numa transação externa que desfaz em caso de prévia ou de erro
  try {
    await tx(async () => { await rodar(); if (!confirmar || resultado.some((r) => !r.ok)) throw new Reverter(); });
  } catch (e) { if (!(e instanceof Reverter)) throw e; }
  const erros = resultado.filter((r) => !r.ok).length;
  return { tipo, confirmado: !!confirmar && erros === 0, total: resultado.length, validas: resultado.length - erros, com_erro: erros, ignoradas: desconhecidas, linhas: resultado };
}
