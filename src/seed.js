import { query, one, tx } from './db.js';

// Estrutura inicial do Dashboard Mota Construções.
// Tudo aqui é FICTÍCIO (modelo para apresentação): o dono ajusta contas, categorias e equipe nas próprias telas.
// Com DEMO=1 (ou `npm run demo`) entram também obras, materiais, documentos etc. de exemplo (src/demo-mota.js).
export async function seed() {
  const { n } = await one('SELECT COUNT(*) AS n FROM empresas');
  if (n > 0) return false;

  await tx(async () => {
    const ins = async (sql, p) => (await one(sql + ' RETURNING id', p)).id;
    const emp = (nome, obs) => ins('INSERT INTO empresas (nome, obs) VALUES ($1,$2)', [nome, obs ?? null]);
    const mota = await emp('Mota Construções', 'Empresa executora das obras (CNPJ principal).');
    const empreend = await emp('Mota Empreendimentos', 'Empresa de investimentos: recebe aportes de sócios/investidores e financia obras próprias.');

    const conta = (nome, empresa, tipo, modalidade, obs) =>
      ins('INSERT INTO contas (nome, empresa_id, tipo, modalidade, obs) VALUES ($1,$2,$3,$4,$5)', [nome, empresa, tipo, modalidade, obs ?? null]);

    // Contas PJ (modalidade com_nota na tela aparece como "Conta PJ")
    await conta('Itaú Empresas', mota, 'banco', 'com_nota', 'Conta principal de recebimento das medições.');
    await conta('Caixa Econômica (obras financiadas)', mota, 'banco', 'com_nota', 'Recebe liberações de financiamento de obras.');
    await conta('Bradesco', mota, 'banco', 'com_nota');
    await conta('Inter PJ (Empreendimentos)', empreend, 'banco', 'com_nota', 'Aportes de sócios e investidores.');
    // Caixas de campo (modalidade sem_nota na tela aparece como "Caixa de obra")
    await conta('Fundo fixo de obras', mota, 'dinheiro', 'sem_nota', 'Dinheiro para pequenas compras e diárias nas obras.');
    await conta('Cartão corporativo', mota, 'intermediaria', 'sem_nota', 'Compras de material no cartão.');
    await conta('Caixa do escritório', mota, 'dinheiro', 'sem_nota');

    const cat = (nome, tipo, grupo) => ins('INSERT INTO categorias (nome, tipo, grupo) VALUES ($1,$2,$3)', [nome, tipo, grupo]);
    // Entradas
    await cat('Recebimento de cliente', 'entrada', 'Receitas');
    await cat('Medição recebida', 'entrada', 'Receitas');
    await cat('Sinal / entrada de contrato', 'entrada', 'Receitas');
    await cat('Liberação de financiamento', 'entrada', 'Receitas');
    await cat('Aporte de sócio', 'entrada', 'Receitas');
    await cat('Outras entradas', 'entrada', 'Receitas');
    // Materiais
    await cat('Cimento e concreto', 'saida', 'Materiais');
    await cat('Aço e ferragens', 'saida', 'Materiais');
    await cat('Alvenaria (blocos e tijolos)', 'saida', 'Materiais');
    await cat('Madeira e fôrmas', 'saida', 'Materiais');
    await cat('Elétrica e hidráulica (material)', 'saida', 'Materiais');
    await cat('Acabamentos (piso, revestimento, tinta)', 'saida', 'Materiais');
    await cat('Outros materiais', 'saida', 'Materiais');
    // Mão de obra
    await cat('Salário', 'saida', 'Mão de obra');
    await cat('Diárias', 'saida', 'Mão de obra');
    await cat('Encargos (INSS, FGTS)', 'saida', 'Mão de obra');
    await cat('Empreiteiros e autônomos', 'saida', 'Mão de obra');
    await cat('Terceirizadas (serviços)', 'saida', 'Mão de obra');
    await cat('Pró-labore', 'saida', 'Mão de obra');
    await cat('Vale-transporte e alimentação', 'saida', 'Mão de obra');
    // Equipamentos
    await cat('Locação de equipamentos', 'saida', 'Equipamentos');
    await cat('Combustível', 'saida', 'Equipamentos');
    await cat('Manutenção de máquinas', 'saida', 'Equipamentos');
    // Documentação e segurança
    await cat('ART / RRT e taxas de conselho', 'saida', 'Documentação');
    await cat('Alvarás e taxas', 'saida', 'Documentação');
    await cat('Projetos e consultoria', 'saida', 'Documentação');
    await cat('EPI e uniformes', 'saida', 'Segurança');
    await cat('Seguros', 'saida', 'Segurança');
    // Administrativo
    await cat('Escritório (aluguel e contas)', 'saida', 'Administrativo');
    await cat('Contabilidade e jurídico', 'saida', 'Administrativo');
    await cat('Marketing e anúncios', 'saida', 'Administrativo');
    await cat('Impostos sobre faturamento', 'saida', 'Tributos');
    await cat('Distribuição de lucros', 'saida', 'Sócios');
    const emprestimo = await cat('Empréstimo / financiamento', 'saida', 'Financeiro');
    await cat('Outras despesas', 'saida', 'Administrativo');

    const pessoa = (nome, funcao, vinculo, pagador, obs) =>
      ins('INSERT INTO pessoas (nome, funcao, vinculo, pagador_padrao, obs) VALUES ($1,$2,$3,$4,$5)', [nome, funcao, vinculo, pagador, obs ?? null]);
    await pessoa('Diogo Mota', 'Sócio-diretor', 'socio', 'Mota Construções');
    await pessoa('Marcelo Mota', 'Sócio-diretor', 'socio', 'Mota Construções');
    await pessoa('Investidor Exemplo', 'Sócio investidor', 'socio', 'Mota Empreendimentos');
    await pessoa('Rodrigo Carvalho', 'Engenheiro civil', 'mota', 'Mota Construções', 'Responsável técnico pelas obras sob sua responsabilidade.');

    const idConta = async (nm) => (await one('SELECT id FROM contas WHERE nome = $1', [nm])).id;
    const idPessoa = async (nm) => (await one('SELECT id FROM pessoas WHERE nome = $1', [nm])).id;
    // Recorrência de exemplo: financiamento do maquinário (dia 10)
    await query(`INSERT INTO recorrencias (nome, dia_mes, valor, estimado, tipo, conta_id, categoria_id, descricao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      'Parcela do financiamento de equipamentos', 10, 1250000, 0, 'saida', await idConta('Itaú Empresas'), emprestimo, 'Betoneiras, andaimes e caminhão (parcela fixa — valor fictício).']);

    // Quadro societário (fictício). Participação em pontos-base: 10000 = 100%.
    await query(`INSERT INTO socios (nome, participacao_bp, aporte, obs) VALUES ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)`, [
      'Diogo Mota', 4500, 150000000, 'Sócio-diretor. Responsável por obras e relacionamento com clientes (dado fictício).',
      'Marcelo Mota', 4500, 150000000, 'Sócio-diretor. Responsável por financeiro e compras (dado fictício).',
      'Investidor Exemplo', 1000, 100000000, 'Sócio investidor (fictício): aportou capital para a compra de equipamentos e capital de giro.']);

    // Diretoria no cadastro de pessoas
    const gestao = [
      ['Diogo Mota', 'Diogo Mota', 'Sócio-diretor', 'Diretoria', 'socio', 'diretoria'],
      ['Marcelo Mota', 'Marcelo Mota', 'Sócio-diretor', 'Diretoria', 'socio', 'diretoria'],
    ];
    for (const [pessoaNome, nome, cargo, setor, regime, funcao] of gestao) {
      await query(`INSERT INTO funcionarios (pessoa_id, nome, cargo, setor, regime, grupo, vinculo, funcao_obra) VALUES ((SELECT id FROM pessoas WHERE nome = $1), $2, $3, $4, $5, 'gestao', 'socio', $6)`, [pessoaNome, nome, cargo, setor, regime, funcao]);
    }
    await query(`INSERT INTO funcionarios (pessoa_id, nome, cargo, setor, regime, vinculo, funcao_obra, conselho, registro_profissional) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [await idPessoa('Rodrigo Carvalho'), 'Rodrigo Carvalho', 'Engenheiro civil', 'Engenharia', 'clt', 'mota', 'engenheiro', 'CREA-RJ', '2019104587 (fictício)']);

    // Catálogo de serviços do comercial
    await query(`INSERT INTO produtos_catalogo (nome) VALUES ('Construção residencial'), ('Reforma completa'), ('Obra comercial'), ('Piscina e área de lazer'), ('Ampliação / cobertura'), ('Fachada e revestimentos'), ('Infraestrutura de condomínio'), ('Projeto e gerenciamento de obra')`);

    // Fornecedores e terceirizadas básicos (a gestão acrescenta os demais na tela)
    await query(`INSERT INTO fornecedores (nome, categoria, prazo_dias, obs) VALUES
      ('Concreteira Carioca (exemplo)', 'Cimento e concreto', 2, 'Fornecedor fictício'),
      ('Aço Rio Ferragens (exemplo)', 'Aço e ferragens', 3, 'Fornecedor fictício'),
      ('Depósito Barra Materiais (exemplo)', 'Material básico', 1, 'Fornecedor fictício'),
      ('Elétrica Jacarepaguá (exemplo)', 'Elétrica e hidráulica', 2, 'Fornecedor fictício'),
      ('Locadora Andaimes RJ (exemplo)', 'Locação de equipamentos', 1, 'Fornecedor fictício')`);
  });
  if (process.env.DEMO === '1') await (await import('./demo-mota.js')).popularDemo();
  return true;
}
