// Indicadores de desempenho da obra: prazo (SPI) e custo (CPI), como na gestão de projetos.
// SPI = avanço real ÷ avanço esperado até hoje. CPI = valor produzido (avanço × orçamento de custo) ÷ custo realizado.
// Acima de 1 é melhor que o planejado.
export function indicadoresDe({ esperado, progresso, orcamento_custo, custo }) {
  const spi = esperado > 0 ? Math.round((progresso / esperado) * 100) / 100 : null;
  const cpi = custo > 0 && orcamento_custo > 0 ? Math.round(((progresso / 100) * orcamento_custo / custo) * 100) / 100 : null;
  const faixa = (v) => (v == null ? null : v >= 0.95 ? 'ok' : v >= 0.85 ? 'atencao' : 'ruim');
  return { esperado, progresso, spi, cpi, spi_faixa: faixa(spi), cpi_faixa: faixa(cpi), previsao_custo_final: cpi && cpi > 0 ? Math.round(orcamento_custo / cpi) : null };
}
