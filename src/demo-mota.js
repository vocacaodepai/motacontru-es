// Dados FICTÍCIOS de demonstração da Mota Construções: obras, equipe, materiais, documentos, caixa, comercial...
// Nada aqui é real: nomes, valores, CPFs e números de documentos são inventados para apresentar o sistema.
// Uso: DEMO=1 npm start   (banco vazio)   ou   npm run demo   (popula o banco configurado, se ainda não tiver obras)
import PDFDocument from 'pdfkit';
import { query, one, tx } from './db.js';
import { hoje, addDias, criarLancamento, lancarRecorrencia } from './services.js';
import * as A from './auth.js';
import * as OB from './obras.js';
import * as MT from './materiais.js';
import * as DC from './documentos.js';
import * as CO from './comercial.js';
import * as MK from './marketing.js';
import * as ES from './estoque.js';
import * as DP from './dp.js';
import * as P from './patrimonio.js';
import * as CB from './cobranca.js';

// sorteio repetível: a demonstração sai igual toda vez
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261013);
const pick = (l) => l[Math.floor(rand() * l.length)];
const entre = (a, b) => a + rand() * (b - a);
const cent = (reais) => Math.round(reais * 100);
const arred = (c, passo = 1000) => Math.round(c / passo) * passo; // arredonda para R$ 10

function cpfFicticio(n) {
  const d = String(100000000 + n * 7919).slice(0, 9).split('').map(Number);
  const dv = (arr) => { let s = 0; arr.forEach((x, i) => (s += x * (arr.length + 1 - i))); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const a = dv(d), b = dv([...d, a]);
  return [...d, a, b].join('');
}
const pdfExemplo = (titulo) => new Promise((ok) => {
  const doc = new PDFDocument({ size: 'A4', margin: 60 }); const parts = [];
  doc.on('data', (c) => parts.push(c)); doc.on('end', () => ok(Buffer.concat(parts)));
  doc.fontSize(20).text('Mota Construções', { align: 'center' }).moveDown().fontSize(15).text(titulo, { align: 'center' }).moveDown(2)
    .fontSize(11).text('Documento de exemplo gerado pela demonstração do sistema. Não tem validade legal: serve apenas para mostrar o anexo de arquivos.', { align: 'justify' });
  doc.end();
});

export async function popularDemo() {
  if ((await one('SELECT COUNT(*) AS n FROM obras')).n > 0) return false;
  const H = hoje();
  const d = (n) => addDias(H, n);
  const senha = process.env.DEMO_SENHA || 'mota2026';

  await tx(async () => {
    // ---------- acessos ----------
    const novoUsuario = (nome, login, papel) => A.criarUsuario({ nome, login, senha, papel });
    const diogo = await novoUsuario('Diogo Mota', 'diogo.mota', 'admin');
    const marcelo = await novoUsuario('Marcelo Mota', 'marcelo.mota', 'admin');
    const rodUser = await novoUsuario('Rodrigo Carvalho', 'rodrigo.carvalho', 'engenheiro');
    const camUser = await novoUsuario('Camila Duarte', 'camila.duarte', 'engenheiro');
    const ana = await novoUsuario('Ana Paula Ribeiro', 'ana.financeiro', 'financeiro');
    const julia = await novoUsuario('Júlia Andrade', 'julia.comercial', 'comercial');
    await novoUsuario('Investidor Exemplo', 'investidor', 'socio');
    const pedro = await novoUsuario('Pedro Lacerda', 'pedro.estoque', 'estoque');
    await novoUsuario('Bianca Freitas', 'bianca.marketing', 'marketing');
    const admin = { id: diogo.id, nome: diogo.nome, papel: 'admin' };
    const vendedora = { id: julia.id, nome: julia.nome, papel: 'comercial' };

    // ---------- equipe ----------
    await query("UPDATE contas SET saldo_inicial = $1 WHERE nome = 'Itaú Empresas'", [cent(420000)]);
    await query("UPDATE contas SET saldo_inicial = $1 WHERE nome = 'Fundo fixo de obras'", [cent(12000)]);
    let n = 0;
    const FUNC = async (nome, funcao_obra, cargo, regime, vinculo, extra = {}) => {
      n++;
      const f = await DP.salvar(null, {
        nome, funcao_obra, cargo, regime, vinculo, setor: extra.setor || 'Obras', cpf: cpfFicticio(n), data_nascimento: `${1970 + (n * 3) % 32}-${String(1 + (n * 5) % 12).padStart(2, '0')}-${String(1 + (n * 7) % 27).padStart(2, '0')}`,
        telefone: `(21) 9${8000 + n * 13}-${1000 + n * 37}`, endereco: `Rua Exemplo ${n * 3}`, bairro: pick(['Campo Grande', 'Santa Cruz', 'Jacarepaguá', 'Realengo', 'Bangu', 'Taquara', 'Cosmos']), cidade: 'Rio de Janeiro', uf: 'RJ',
        emergencia_nome: 'Contato de emergência', emergencia_telefone: `(21) 9${7000 + n * 11}-${2000 + n * 41}`, data_admissao: d(-(120 + n * 23)), jornada_entrada: '07:00', jornada_saida: '16:00', jornada_intervalo_min: 60,
        dias_trabalho: '1,2,3,4,5', ctps_numero: regime === 'clt' ? String(100000 + n * 17) : null, ctps_serie: regime === 'clt' ? '0001' : null,
        aso_validade: extra.aso ?? d(120 + (n * 11) % 200), salario: extra.salario ?? null, valor_diaria: extra.diaria ?? null, ...extra.campos,
      });
      return f.id;
    };
    const DIAS = (v) => cent(v);
    const rodrigo = (await one("SELECT id FROM funcionarios WHERE nome = 'Rodrigo Carvalho'")).id;
    await query("UPDATE funcionarios SET usuario_id = $1, cpf = $2, data_nascimento = '1990-03-14', telefone = '(21) 99811-4021', data_admissao = $3, salario = $4 WHERE id = $5", [rodUser.id, cpfFicticio(900), d(-900), cent(14500), rodrigo]);
    const camila = await FUNC('Camila Duarte', 'engenheiro', 'Engenheira civil', 'clt', 'mota', { setor: 'Engenharia', salario: cent(13200), campos: { conselho: 'CREA-RJ', registro_profissional: '2022107733 (fictício)' } });
    await query('UPDATE funcionarios SET usuario_id = $1 WHERE id = $2', [camUser.id, camila]);
    const beatriz = await FUNC('Beatriz Lemos', 'arquiteto', 'Arquiteta e urbanista', 'pj', 'autonomo', { setor: 'Projetos', campos: { conselho: 'CAU-RJ', registro_profissional: 'A128450-7 (fictício)' } });
    const antonio = await FUNC('Antônio Ferreira', 'mestre_de_obras', 'Mestre de obras', 'clt', 'mota', { salario: cent(6200) });
    const josue = await FUNC('Josué Barbosa', 'mestre_de_obras', 'Mestre de obras', 'clt', 'mota', { salario: cent(5900) });
    const edvaldo = await FUNC('Edvaldo Santos', 'encarregado', 'Encarregado', 'clt', 'mota', { salario: cent(4700) });
    const patricia = await FUNC('Patrícia Nogueira', 'tecnico_seguranca', 'Técnica de segurança do trabalho', 'clt', 'mota', { salario: cent(4300), aso: d(15) });
    await FUNC('Lucas Teixeira', 'estagiario', 'Estagiário de engenharia', 'estagio', 'mota', { setor: 'Engenharia', salario: cent(2100) });
    await FUNC('Ana Paula Ribeiro', 'administrativo', 'Administrativo-financeiro', 'clt', 'mota', { setor: 'Administrativo', salario: cent(5200) });
    const mk = async (lista, funcao, cargo, regime, vinculo, diaria, salario) => { const ids = []; for (const nm of lista) ids.push(await FUNC(nm, funcao, cargo, regime, vinculo, { diaria: diaria ? DIAS(diaria) : null, salario: salario ? cent(salario) : null })); return ids; };
    const pedreiros = await mk(['Wellington Souza', 'Marcos Vinícius Lima', 'Cláudio Pereira', 'Sebastião Alves', 'Roberto Gomes', 'Ivan Cardoso'], 'pedreiro', 'Pedreiro', 'clt', 'mota', null, 3300);
    const serventes = await mk(['José Raimundo', 'Fábio Martins', 'Anderson Costa', 'Reginaldo Dias', 'Paulo Henrique', 'Gilmar Rocha', 'Ednaldo Silva', 'Carlos Eduardo'], 'servente', 'Servente', 'clt', 'mota', null, 2300);
    const peoes = await mk(['Valdir Moreira', 'Jonas Andrade', 'Rafael Brito', 'Alessandro Pinto'], 'peao', 'Peão de obra', 'diarista', 'informal', 180);
    const [carpinteiro] = await mk(['Osvaldo Nunes'], 'carpinteiro', 'Carpinteiro', 'clt', 'mota', null, 3400);
    const [armador] = await mk(['Genivaldo Cruz'], 'armador', 'Armador', 'clt', 'mota', null, 3400);
    const [eletricista] = await mk(['Thiago Mendes'], 'eletricista', 'Eletricista', 'clt', 'mota', null, 3800);
    const [encanador] = await mk(['Rubens Teixeira'], 'encanador', 'Encanador', 'empreiteiro', 'autonomo', 380);
    const [pintor] = await mk(['Nelson Araújo'], 'pintor', 'Pintor', 'empreiteiro', 'autonomo', 340);
    const [operador] = await mk(['Humberto Pires'], 'operador_maquina', 'Operador de retroescavadeira', 'clt', 'mota', null, 4100);
    const [motorista] = await mk(['Sandro Lopes'], 'motorista', 'Motorista de caminhão', 'clt', 'mota', null, 3500);
    // contrata ASO vencida e uma ficha incompleta, para mostrar os avisos
    await query("UPDATE funcionarios SET aso_validade = $1 WHERE id = $2", [d(-9), peoes[1]]);
    await query("UPDATE funcionarios SET cpf = NULL, telefone = NULL WHERE id = $1", [peoes[3]]);

    // ---------- fornecedores e terceirizadas ----------
    const forn = Object.fromEntries((await query('SELECT id, nome FROM fornecedores')).map((f) => [f.nome.split(' (')[0], f.id]));
    const concreteira = forn['Concreteira Carioca'], aco = forn['Aço Rio Ferragens'], deposito = forn['Depósito Barra Materiais'], eletrica = forn['Elétrica Jacarepaguá'], locadora = forn['Locadora Andaimes RJ'];
    for (const [nome, categoria, prazo] of [['Casa do Acabamento Recreio', 'Acabamentos', 5], ['Madeireira Pavuna', 'Madeira', 3], ['Tintas & Cores Barra', 'Acabamentos', 2]]) {
      await MT.salvarFornecedor(null, { nome: `${nome} (exemplo)`, categoria, prazo_dias: prazo, obs: 'Fornecedor fictício' });
    }
    const acabamento = (await one("SELECT id FROM fornecedores WHERE nome LIKE 'Casa do Acabamento%'")).id;
    const madeireira = (await one("SELECT id FROM fornecedores WHERE nome LIKE 'Madeireira%'")).id;
    const tintas = (await one("SELECT id FROM fornecedores WHERE nome LIKE 'Tintas%'")).id;
    const T = {};
    for (const [k, nome, esp, nota, cert, seg] of [
      ['led', 'LED Vision Fachadas (fictícia)', 'Painel de LED e comunicação visual', 5, d(160), d(210)],
      ['piscina', 'Aqua Azul Piscinas (fictícia)', 'Piscinas', 4, d(22), d(300)],
      ['eletrica', 'Prime Instalações Elétricas (fictícia)', 'Elétrica', 4, d(95), d(40)],
      ['esquadria', 'Vidraçaria Barra Glass (fictícia)', 'Esquadrias e vidros', 5, d(-6), d(180)],
      ['clima', 'ClimaTec Refrigeração (fictícia)', 'Ar-condicionado', 4, d(130), d(130)],
      ['verde', 'Jardins do Rio Paisagismo (fictícia)', 'Paisagismo', 5, d(75), d(75)],
    ]) T[k] = await MT.salvarTerceirizada(null, { nome, especialidade: esp, nota, certidoes_validade: cert, seguro_validade: seg, responsavel: 'Responsável (fictício)', telefone: '(21) 3000-0000', obs: 'Empresa fictícia para demonstração.' });

    // ---------- clientes, orçamentos e campanhas ----------
    const campIg = await MK.salvarCampanha(null, { nome: 'Instagram — Casas de alto padrão', canal: 'instagram', data_inicio: d(-75), objetivo: 'Leads de construção residencial', verba: cent(18000) }, admin);
    const campGoogle = await MK.salvarCampanha(null, { nome: 'Google — Construtora na Barra', canal: 'google', data_inicio: d(-60), objetivo: 'Busca por construtora e reforma', verba: cent(12000) }, admin);
    for (let i = 70; i >= 1; i--) {
      if (i <= 75) await MK.lancarDia({ campanha_id: campIg.id, data: d(-i), gasto: arred(cent(entre(190, 290))), impressoes: Math.round(entre(5200, 9800)), cliques: Math.round(entre(90, 210)), leads: rand() < 0.45 ? Math.round(entre(1, 4)) : 0 });
      if (i <= 58) await MK.lancarDia({ campanha_id: campGoogle.id, data: d(-i), gasto: arred(cent(entre(150, 240))), impressoes: Math.round(entre(2200, 4500)), cliques: Math.round(entre(60, 140)), leads: rand() < 0.4 ? Math.round(entre(1, 3)) : 0 });
    }
    const CLI = [
      ['Família Albuquerque', 'albuquerque', 'Casa em condomínio — Alphaville'], ['Dr. Henrique Salles', 'salles', 'Casa de praia — Recreio'], ['Condomínio Porto Belo (Associação)', 'portobelo', 'Infraestrutura e áreas comuns'],
      ['Cobertura Vista Mar Ltda', 'vistamar', 'Piscina e deck'], ['Rede Ponto Forte Comércio', 'pontoforte', 'Fachada com painel de LED'], ['Grupo Lagoa Empreendimentos', 'lagoa', 'Edifício comercial'],
      ['Família Nascimento', 'nascimento', 'Residência Joá'], ['Marina Teixeira', 'marina', 'Reforma de apartamento'], ['Escritório Contábil Aurora', 'aurora', 'Reforma de sala comercial'],
      ['Sr. Paulo Menezes', 'menezes', 'Ampliação de casa'], ['Clínica Bem Viver', 'bemviver', 'Obra comercial'], ['Família Ramalho', 'ramalho', 'Casa em Vargem Grande'],
    ];
    const cli = {}; const orc = {};
    const fic = (nome, slug, i) => ({ nome, telefone: `(21) 9${6000 + i * 17}-${3000 + i * 29}`, email: `${slug}@exemplo.com.br`, aniversario: `19${70 + (i * 3) % 25}-${String(1 + (i * 5) % 12).padStart(2, '0')}-${String(1 + (i * 7) % 27).padStart(2, '0')}` });
    const novoOrc = async (idx, produto, valor, dias, origem, extra = {}) => {
      const [nome, slug] = CLI[idx];
      const o = await CO.criarOrcamento({ cliente: fic(nome, slug, idx), produto_nome: produto, valor: cent(valor), data: d(dias), origem, ...extra }, vendedora);
      cli[slug] = o.cliente_id; orc[slug] = o.id; return o;
    };
    // vendidos (viram obras)
    await novoOrc(0, 'Construção residencial', 3850000, -200, 'indicacao');
    await novoOrc(1, 'Construção residencial', 2400000, -140, 'instagram', { campanha_id: campIg.id });
    await novoOrc(2, 'Infraestrutura de condomínio', 6200000, -260, 'indicacao');
    await novoOrc(3, 'Piscina e área de lazer', 780000, -150, 'google_anuncio', { campanha_id: campGoogle.id });
    await novoOrc(4, 'Fachada e revestimentos', 1150000, -95, 'cliente_antigo');
    await novoOrc(5, 'Obra comercial', 9800000, -70, 'feira');
    await novoOrc(6, 'Construção residencial', 2900000, -420, 'indicacao');
    for (const slug of ['albuquerque', 'salles', 'portobelo', 'vistamar', 'pontoforte', 'lagoa', 'nascimento']) await CO.mudarStatus(orc[slug], { status: 'ganho' }, admin);
    // negociações em andamento, perdidos e novos
    await novoOrc(7, 'Reforma completa', 420000, -2, 'instagram', { campanha_id: campIg.id });
    await novoOrc(8, 'Reforma completa', 185000, -1, 'google_busca', { campanha_id: campGoogle.id });
    await novoOrc(9, 'Ampliação / cobertura', 560000, -2, 'whatsapp');
    await novoOrc(10, 'Obra comercial', 1380000, -2, 'site');
    await novoOrc(11, 'Construção residencial', 2150000, -1, 'instagram', { campanha_id: campIg.id });
    const perdido = (await CO.criarOrcamento({ cliente: fic('Sr. Luiz Gouveia', 'gouveia', 40), produto_nome: 'Reforma completa', valor: cent(310000), data: d(-50), origem: 'google_anuncio', campanha_id: campGoogle.id }, vendedora));
    await CO.mudarStatus(perdido.id, { status: 'perdido', motivo: 'Fechou com outra construtora por prazo menor.' }, vendedora);
    const perdido2 = (await CO.criarOrcamento({ cliente: fic('Dra. Elaine Costa', 'costa', 41), produto_nome: 'Fachada e revestimentos', valor: cent(240000), data: d(-33), origem: 'instagram', campanha_id: campIg.id }, vendedora));
    await CO.mudarStatus(perdido2.id, { status: 'perdido', motivo: 'Adiou a obra para o ano que vem.' }, vendedora);
    // um aprovado recente que ainda não virou obra (para mostrar o botão "Criar obra")
    const novoGanho = await CO.criarOrcamento({ cliente: fic('Sra. Cláudia Ferraz', 'ferraz', 42), produto_nome: 'Ampliação / cobertura', valor: cent(690000), data: d(-6), origem: 'indicacao' }, vendedora);
    await CO.mudarStatus(novoGanho.id, { status: 'ganho' }, admin);
    // os contratos que já viraram obra são cobrados por medição: saem da fila de cobrança do orçamento
    for (const g of await query("SELECT id, valor, data FROM orcamentos WHERE status = 'ganho' AND id <> $1 ORDER BY id", [novoGanho.id])) {
      await CB.registrarPagamento(g.id, { valor: g.valor, data: addDias(g.data, 3), lancar: false, obs: 'Contrato cobrado por medições da obra (receita lançada nas medições)' }, admin);
    }

    // ---------- obras ----------
    const mkObra = async (b, alvo) => {
      const id = await OB.salvar(admin, null, b);
      await OB.gerarFasesModelo(admin, id);
      const fases = await query('SELECT id, peso, inicio_prev, fim_prev FROM obra_fases WHERE obra_id = $1 ORDER BY ordem', [id]);
      const total = fases.reduce((a, f) => a + f.peso, 0);
      let resta = (alvo / 100) * total;
      for (const f of fases) {
        const p = Math.max(0, Math.min(100, Math.round((resta / f.peso) * 100))); resta -= (f.peso * p) / 100;
        await query('UPDATE obra_fases SET progresso = $1, inicio_real = $2, fim_real = $3 WHERE id = $4', [p, p > 0 ? f.inicio_prev : null, p === 100 ? f.fim_prev : null, f.id]);
      }
      return id;
    };
    const O = {};
    O.a = await mkObra({ nome: 'Casa Alphaville — Residência Alto Padrão', tipo: 'residencial', status: 'em_andamento', endereco: 'Condomínio Alphaville, quadra 7, lote 12', bairro: 'Alphaville Barra da Tijuca', cidade: 'Rio de Janeiro', area_m2: 420, pavimentos: 2, data_inicio: d(-170), previsao_fim: d(110), valor_contrato: cent(3850000), orcamento_custo: cent(2950000), cliente_id: cli.albuquerque, orcamento_id: orc.albuquerque, engenheiro_id: rodrigo, mestre_id: antonio, descricao: 'Residência de alto padrão em dois pavimentos, piscina e área gourmet.' }, 58);
    O.b = await mkObra({ nome: 'Casa de Praia — Recreio dos Bandeirantes', tipo: 'residencial', status: 'em_andamento', endereco: 'Rua das Palmeiras, 240', bairro: 'Recreio dos Bandeirantes', area_m2: 310, pavimentos: 2, data_inicio: d(-80), previsao_fim: d(200), valor_contrato: cent(2400000), orcamento_custo: cent(1850000), cliente_id: cli.salles, orcamento_id: orc.salles, engenheiro_id: rodrigo, mestre_id: josue, descricao: 'Casa de praia com varanda ampla e deck.' }, 29);
    O.c = await mkObra({ nome: 'Condomínio Porto Belo — Infraestrutura e áreas comuns', tipo: 'condominio', status: 'em_andamento', endereco: 'Estrada do Porto Belo, km 4', bairro: 'Porto Belo', cidade: 'Mangaratiba', area_m2: 18000, data_inicio: d(-210), previsao_fim: d(150), valor_contrato: cent(6200000), orcamento_custo: cent(4900000), cliente_id: cli.portobelo, orcamento_id: orc.portobelo, engenheiro_id: camila, mestre_id: edvaldo, descricao: 'Drenagem, pavimentação, redes e áreas comuns do condomínio.' }, 41);
    O.d = await mkObra({ nome: 'Cobertura Barra — Piscina e deck', tipo: 'piscina', status: 'em_andamento', endereco: 'Av. Lúcio Costa, cobertura 1801', bairro: 'Barra da Tijuca', area_m2: 85, data_inicio: d(-105), previsao_fim: d(-6), valor_contrato: cent(780000), orcamento_custo: cent(570000), cliente_id: cli.vistamar, orcamento_id: orc.vistamar, engenheiro_id: camila, mestre_id: josue, descricao: 'Piscina de borda infinita e deck em cobertura (obra com atraso na entrega do revestimento).' }, 84);
    O.e = await mkObra({ nome: 'Fachada Comercial Centro — Painel de LED', tipo: 'fachada', status: 'em_andamento', endereco: 'Rua da Carioca, 120', bairro: 'Centro', area_m2: 260, pavimentos: 4, data_inicio: d(-52), previsao_fim: d(38), valor_contrato: cent(1150000), orcamento_custo: cent(830000), cliente_id: cli.pontoforte, orcamento_id: orc.pontoforte, engenheiro_id: camila, mestre_id: edvaldo, descricao: 'Revestimento da fachada e instalação de painel de LED pela terceirizada.' }, 40);
    O.f = await mkObra({ nome: 'Edifício Comercial Jacarepaguá — 4 pavimentos', tipo: 'comercial', status: 'planejamento', endereco: 'Av. Embaixador Abelardo Bueno, 3500', bairro: 'Jacarepaguá', area_m2: 2400, pavimentos: 4, data_inicio: d(30), previsao_fim: d(500), valor_contrato: cent(9800000), orcamento_custo: cent(7650000), cliente_id: cli.lagoa, orcamento_id: orc.lagoa, engenheiro_id: rodrigo, descricao: 'Edifício de salas comerciais com garagem. Em fase de aprovação de projeto.' }, 0);
    O.g = await mkObra({ nome: 'Residência Joá — Entregue', tipo: 'residencial', status: 'concluida', endereco: 'Estrada do Joá, 800', bairro: 'Joá', area_m2: 380, pavimentos: 2, data_inicio: d(-420), previsao_fim: d(-60), fim_real: d(-52), valor_contrato: cent(2900000), orcamento_custo: cent(2250000), cliente_id: cli.nascimento, orcamento_id: orc.nascimento, engenheiro_id: rodrigo, mestre_id: antonio, descricao: 'Obra concluída e entregue ao cliente.' }, 100);

    // ---------- equipe alocada + presenças ----------
    const alocar = async (obra, ids) => { for (const f of ids) await OB.alocar(admin, obra, { funcionario_id: f, desde: d(-90) }); };
    await alocar(O.a, [antonio, pedreiros[0], pedreiros[1], pedreiros[2], serventes[0], serventes[1], serventes[2], carpinteiro, armador, eletricista, peoes[0]]);
    await alocar(O.b, [josue, pedreiros[3], pedreiros[4], serventes[3], serventes[4], peoes[1]]);
    await alocar(O.c, [edvaldo, operador, motorista, pedreiros[5], serventes[5], serventes[6], serventes[7], peoes[2], encanador]);
    await alocar(O.d, [josue, pintor, peoes[3]]);
    await alocar(O.e, [edvaldo, pedreiros[5], pintor]);
    const ref = ['presente', 'presente', 'presente', 'presente', 'presente', 'presente', 'presente', 'presente', 'atraso', 'falta'];
    const usuarioPorObra = { [O.a]: rodUser.id, [O.b]: rodUser.id, [O.c]: camUser.id, [O.d]: camUser.id, [O.e]: camUser.id };
    for (const obra of [O.a, O.b, O.c, O.d, O.e]) {
      const eq = await query('SELECT funcionario_id FROM obra_equipe WHERE obra_id = $1', [obra]);
      for (let i = 12; i >= 0; i--) {
        const dia = d(-i); const dow = new Date(dia + 'T12:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6) continue;
        if (i === 0 && obra === O.e) continue; // presença de hoje ainda não registrada: aparece nos alertas
        for (const e of eq) {
          const s = pick(ref);
          await query('INSERT INTO obra_presencas (obra_id, funcionario_id, data, situacao, horas, registrado_por_id) VALUES ($1,$2,$3,$4,$5,$6)', [obra, e.funcionario_id, dia, s, s === 'presente' ? 9 : s === 'atraso' ? 8 : 0, usuarioPorObra[obra]]);
        }
      }
    }
    // diário de obra
    const ATIV = {
      [O.a]: ['Concretagem da laje do 2º pavimento concluída; cura iniciada.', 'Instalação de tubulação elétrica no térreo.', 'Assentamento de alvenaria da área gourmet.', 'Montagem de fôrmas da escada.', 'Chapisco e emboço das paredes internas do térreo.'],
      [O.b]: ['Escavação das sapatas concluída.', 'Armação das vigas baldrame.', 'Concretagem das sapatas.', 'Impermeabilização das baldrames.'],
      [O.c]: ['Assentamento de tubos de drenagem na quadra 3.', 'Compactação de sub-base da via principal.', 'Escavação para rede de água.', 'Construção das caixas de inspeção.'],
      [O.d]: ['Aplicação do revestimento da piscina.', 'Testes de estanqueidade.', 'Montagem do deck de madeira.'],
      [O.e]: ['Montagem de andaime fachadeiro.', 'Preparo e regularização da fachada.', 'Aplicação de revestimento no 2º pavimento.'],
    };
    for (const obra of [O.a, O.b, O.c, O.d, O.e]) {
      for (let i = 9; i >= 1; i--) {
        const dia = d(-i); const dow = new Date(dia + 'T12:00:00Z').getUTCDay(); if (dow === 0 || dow === 6) continue;
        if (obra === O.c && i === 1) continue; // diário de ontem sem preencher: aparece nos alertas
        await OB.salvarDiario({ id: usuarioPorObra[obra], papel: 'admin' }, obra, { data: dia, clima: pick(['Ensolarado', 'Nublado', 'Chuva fraca', 'Ensolarado']), efetivo: Math.round(entre(5, 10)), atividades: pick(ATIV[obra]), ocorrencias: rand() < 0.2 ? 'Chuva na parte da tarde atrasou a concretagem.' : null });
      }
    }

    // ---------- terceirizadas por obra ----------
    const contrato = (obra, t, escopo, valor, pago, status, ini, fim) => MT.salvarContratoTerceiro(admin, obra, null, { terceirizada_id: T[t], escopo, valor: cent(valor), pago: cent(pago), status, inicio: ini, fim_prev: fim });
    await contrato(O.e, 'led', 'Fornecimento e instalação do painel de LED da fachada (P4, 6 x 4 m)', 380000, 190000, 'em_execucao', d(-10), d(30));
    await contrato(O.d, 'piscina', 'Execução da piscina de borda infinita e casa de máquinas', 210000, 168000, 'em_execucao', d(-80), d(-8));
    await contrato(O.a, 'eletrica', 'Instalações elétricas e automação residencial', 165000, 70000, 'em_execucao', d(-40), d(70));
    await contrato(O.a, 'esquadria', 'Esquadrias de alumínio e vidros', 138000, 0, 'contratada', d(20), d(80));
    await contrato(O.c, 'verde', 'Paisagismo das áreas comuns', 295000, 60000, 'contratada', d(60), d(140));
    await contrato(O.c, 'eletrica', 'Rede de iluminação das vias', 410000, 120000, 'em_execucao', d(-30), d(110));
    await contrato(O.f, 'clima', 'Sistema de ar-condicionado central (cotação)', 640000, 0, 'cotacao', null, null);

    // ---------- materiais (parte já paga no caixa) ----------
    const CAT = Object.fromEntries((await query('SELECT id, nome FROM categorias')).map((c) => [c.nome, c.id]));
    const CTA = Object.fromEntries((await query('SELECT id, nome FROM contas')).map((c) => [c.nome, c.id]));
    const catalogo = [
      ['Cimento CP-II 50 kg', 'sc', 3490, 'Cimento e concreto', deposito], ['Concreto usinado fck 30 MPa', 'm³', 47000, 'Cimento e concreto', concreteira], ['Areia média', 'm³', 14000, 'Alvenaria (blocos e tijolos)', deposito],
      ['Brita 1', 'm³', 15500, 'Alvenaria (blocos e tijolos)', deposito], ['Vergalhão CA-50 10 mm (barra 12 m)', 'barra', 6200, 'Aço e ferragens', aco], ['Bloco cerâmico 14x19x29', 'un', 290, 'Alvenaria (blocos e tijolos)', deposito],
      ['Tubo PVC esgoto 100 mm', 'barra', 8800, 'Elétrica e hidráulica (material)', eletrica], ['Fio flexível 2,5 mm (rolo 100 m)', 'rolo', 21500, 'Elétrica e hidráulica (material)', eletrica], ['Argamassa AC-III 20 kg', 'sc', 2800, 'Acabamentos (piso, revestimento, tinta)', acabamento],
      ['Porcelanato 80x80 retificado', 'm²', 11900, 'Acabamentos (piso, revestimento, tinta)', acabamento], ['Tinta acrílica premium 18 L', 'lata', 39000, 'Acabamentos (piso, revestimento, tinta)', tintas], ['Madeirite resinado 12 mm', 'chapa', 9800, 'Madeira e fôrmas', madeireira],
      ['Locação de andaime fachadeiro (mês)', 'mês', 1850000, 'Locação de equipamentos', locadora],
    ];
    const lancs = []; // lançamentos em lote
    const lanc = (data, tipo, valor, conta, cat, extra = {}) => lancs.push({ data, tipo, valor, conta: CTA[conta], cat: cat ? CAT[cat] : null, pessoa: extra.pessoa || null, desc: extra.desc || null, obra: extra.obra || null, por: extra.por || ana });
    const mat = async (obra, descTxt, un, qtd, vu, fornecedor, status, dias, pago, categoria) => {
      const dt = d(dias);
      const id = await MT.salvarMaterial({ id: usuarioPorObra[obra] || ana.id, papel: 'admin' }, obra, null, { fornecedor_id: fornecedor, descricao: descTxt, unidade: un, quantidade: qtd, valor_unit: vu, status, data_pedido: dias > 0 ? H : dt, entrega_prevista: ['solicitado', 'pedido'].includes(status) ? dt : addDias(dt, 2), entregue_em: ['entregue', 'aplicado'].includes(status) ? addDias(dt, 2) > H ? H : addDias(dt, 2) : null, nf_numero: pago ? String(4000 + Math.round(rand() * 5000)) : null });
      if (pago) {
        const l = await MT.pagarMaterial(admin, id, { conta_id: vu * qtd > 500000 ? CTA['Itaú Empresas'] : CTA['Cartão corporativo'], categoria_id: CAT[categoria], data: addDias(dt, 2) > H ? H : addDias(dt, 2) }, criarLancamento);
        return l;
      }
    };
    const periodos = { [O.a]: 170, [O.b]: 80, [O.c]: 210, [O.d]: 105, [O.e]: 52 };
    for (const obra of [O.a, O.b, O.c, O.d, O.e]) {
      const total = periodos[obra];
      for (let k = 0; k < 7; k++) {
        const [nm, un, vu, categoria, f] = pick(catalogo.slice(0, 12));
        const dias = -Math.round(entre(8, total - 5));
        const qtd = un === 'm³' || un === 'm²' ? Math.round(entre(10, 60)) : un === 'sc' || un === 'un' ? Math.round(entre(60, 900)) : Math.round(entre(4, 40));
        await mat(obra, nm, un, qtd, vu, f, k < 5 ? 'aplicado' : 'entregue', dias, true, categoria);
      }
    }
    // aluguel de andaime (a pagar), chegadas de hoje e de amanhã, atrasados e pedidos futuros
    await mat(O.e, 'Locação de andaime fachadeiro (mês)', 'mês', 2, 1850000, locadora, 'entregue', -40, false, null);
    await mat(O.a, 'Concreto usinado fck 30 MPa (laje da cobertura)', 'm³', 14, 47000, concreteira, 'pedido', 0, false, null);
    await mat(O.b, 'Cimento CP-II 50 kg', 'sc', 120, 3490, deposito, 'pedido', 0, false, null);
    await mat(O.a, 'Vergalhão CA-50 12,5 mm (barra 12 m)', 'barra', 180, 9400, aco, 'pedido', 1, false, null);
    await mat(O.c, 'Tubo PVC esgoto 100 mm', 'barra', 220, 8800, eletrica, 'pedido', -3, false, null);
    await mat(O.e, 'Perfil metálico para painel de LED', 'un', 36, 21500, deposito, 'pedido', 3, false, null);
    await mat(O.d, 'Porcelanato piscina 30x30', 'm²', 95, 14500, acabamento, 'solicitado', 2, false, null);

    // ---------- medições (receita) ----------
    // [valor em reais, situação, dias a partir de hoje]
    const medir = async (obra, itens) => {
      let num = 0;
      for (const [v, status, dias] of itens) {
        num++;
        const id = await OB.salvarMedicao(admin, obra, null, { descricao: `Medição ${num}`, data_prevista: d(dias), valor: cent(v), status: status === 'recebida' ? 'prevista' : status });
        if (status === 'recebida') await OB.receberMedicao(admin, id, { data: d(dias), conta_id: CTA['Itaú Empresas'] }, criarLancamento);
      }
    };
    await medir(O.a, [[580000, 'recebida', -160], [520000, 'recebida', -118], [520000, 'recebida', -70], [520000, 'recebida', -9], [560000, 'faturada', 12], [570000, 'prevista', 55], [580000, 'prevista', 100]]);
    await medir(O.b, [[360000, 'recebida', -75], [360000, 'recebida', -22], [420000, 'prevista', 6], [420000, 'prevista', 45], [420000, 'prevista', 90], [420000, 'prevista', 140]]);
    await medir(O.c, [[900000, 'recebida', -190], [900000, 'recebida', -135], [900000, 'recebida', -80], [900000, 'faturada', -12], [900000, 'prevista', 20], [900000, 'prevista', 70], [800000, 'prevista', 130]]);
    await medir(O.d, [[230000, 'recebida', -95], [230000, 'recebida', -50], [320000, 'faturada', 9]]);
    await medir(O.e, [[345000, 'recebida', -45], [345000, 'faturada', 14], [460000, 'prevista', 40]]);
    await medir(O.f, [[980000, 'prevista', 45], [980000, 'prevista', 120]]);
    await medir(O.g, [[870000, 'recebida', -400], [870000, 'recebida', -280], [1160000, 'recebida', -150]]);

    // ---------- caixa: custos por obra, despesas gerais, aportes e distribuição ----------
    const GRUPO = [['Cimento e concreto', 18], ['Aço e ferragens', 10], ['Alvenaria (blocos e tijolos)', 10], ['Elétrica e hidráulica (material)', 8], ['Acabamentos (piso, revestimento, tinta)', 8], ['Diárias', 14], ['Salário', 14], ['Empreiteiros e autônomos', 8], ['Locação de equipamentos', 6], ['Combustível', 3], ['EPI e uniformes', 1]];
    const sorteiaCat = () => { let r = rand() * GRUPO.reduce((a, [, w]) => a + w, 0); for (const [c, w] of GRUPO) { if ((r -= w) <= 0) return c; } return GRUPO[0][0]; };
    const objetivo = [[O.a, 0.58, 170, 2950000], [O.b, 0.29, 80, 1850000], [O.c, 0.41, 210, 4900000], [O.d, 0.84, 105, 570000], [O.e, 0.4, 52, 830000], [O.g, 1, 360, 2250000]];
    for (const [obra, avanco, dias, orcado] of objetivo) {
      const jaPago = (await one("SELECT COALESCE(SUM(valor),0) AS v FROM lancamentos WHERE obra_id = $1 AND tipo = 'saida'", [obra])).v;
      const alvo = cent(orcado) * avanco * 0.82 - jaPago;
      if (alvo <= 0) continue;
      const semanas = Math.max(2, Math.round(dias / 7));
      const porSemana = alvo / semanas;
      const inicio = obra === O.g ? -420 : -dias;
      for (let s = 0; s < semanas; s++) {
        const base = inicio + s * 7 + 6;
        for (let j = 0; j < 3; j++) {
          const dia = Math.min(-2, base - Math.round(entre(0, 5)));
          const categoria = sorteiaCat();
          const valor = arred(porSemana / 3 * entre(0.6, 1.4));
          const pequeno = ['Diárias', 'Combustível', 'EPI e uniformes'].includes(categoria);
          lanc(d(dia), 'saida', valor, pequeno ? 'Fundo fixo de obras' : 'Itaú Empresas', categoria, { obra, desc: pequeno ? 'Despesa de campo' : categoria });
        }
      }
    }
    // despesas gerais, 6 meses
    for (let m = 6; m >= 0; m--) {
      const base = new Date(H + 'T12:00:00Z'); base.setUTCMonth(base.getUTCMonth() - m);
      const mes = base.toISOString().slice(0, 7);
      const fim = m === 0 ? H : `${mes}-28`;
      const dia = (n) => (`${mes}-${String(n).padStart(2, '0')}` <= H ? `${mes}-${String(n).padStart(2, '0')}` : null);
      const put = (n, tipo, valor, conta, cat, extra) => { const dt = dia(n); if (dt && dt <= fim) lanc(dt, tipo, valor, conta, cat, extra); };
      put(5, 'saida', cent(18500), 'Itaú Empresas', 'Escritório (aluguel e contas)', { desc: 'Aluguel e contas do escritório' });
      put(8, 'saida', cent(3800), 'Itaú Empresas', 'Contabilidade e jurídico', { desc: 'Contabilidade' });
      put(12, 'saida', cent(6200), 'Itaú Empresas', 'Marketing e anúncios', { desc: 'Anúncios (Instagram e Google)' });
      put(15, 'saida', cent(5200), 'Itaú Empresas', 'Seguros', { desc: 'Seguro de equipamentos e frota' });
      put(20, 'saida', cent(5200 + Math.round(rand() * 800)), 'Itaú Empresas', 'Salário', { desc: 'Salário administrativo' });
      put(25, 'saida', cent(46000 + Math.round(rand() * 6000)), 'Itaú Empresas', 'Impostos sobre faturamento', { desc: 'Impostos sobre faturamento do mês' });
      if (m <= 3 && m >= 1) {
        put(26, 'saida', cent(45000), 'Itaú Empresas', 'Distribuição de lucros', { pessoa: 'Diogo Mota', desc: 'Distribuição de lucros' });
        put(26, 'saida', cent(45000), 'Itaú Empresas', 'Distribuição de lucros', { pessoa: 'Marcelo Mota', desc: 'Distribuição de lucros' });
        put(26, 'saida', cent(10000), 'Itaú Empresas', 'Distribuição de lucros', { pessoa: 'Investidor Exemplo', desc: 'Distribuição de lucros' });
      }
    }
    lanc(d(-172), 'entrada', cent(1500000), 'Inter PJ (Empreendimentos)', 'Aporte de sócio', { desc: 'Aporte de capital (fictício)' });
    const pessoas = Object.fromEntries((await query('SELECT id, nome FROM pessoas')).map((p) => [p.nome, p.id]));
    // grava em lote
    for (let i = 0; i < lancs.length; i += 200) {
      const lote = lancs.slice(i, i + 200); const p = [];
      const valores = lote.map((l, k) => { const b = k * 10; p.push(l.data, l.tipo, l.valor, l.conta, l.cat, l.pessoa ? pessoas[l.pessoa] : null, l.desc, l.obra, 'demo', l.por.id); return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`; });
      await query(`INSERT INTO lancamentos (data,tipo,valor,conta_id,categoria_id,pessoa_id,descricao,obra_id,criado_por,criado_por_id) VALUES ${valores.join(',')}`, p);
    }
    await query("INSERT INTO lancamentos (data,tipo,valor,conta_id,conta_destino_id,descricao,criado_por,criado_por_id) VALUES ($1,'transferencia',$2,$3,$4,'Reforço de caixa (fictício)','demo',$5)", [d(-170), cent(1200000), CTA['Inter PJ (Empreendimentos)'], CTA['Itaú Empresas'], ana.id]);
    // o caixa de obra e o cartão são repostos todo mês pela conta principal (fica com saldo realista)
    await query(`INSERT INTO lancamentos (data,tipo,valor,conta_id,conta_destino_id,descricao,criado_por,criado_por_id)
      SELECT date_trunc('month', data)::date, 'transferencia', SUM(valor), $1::bigint, conta_id, 'Reposição do caixa de obra', 'demo', $2::bigint
      FROM lancamentos WHERE tipo = 'saida' AND conta_id IN ($3::bigint, $4::bigint) GROUP BY date_trunc('month', data), conta_id`,
      [CTA['Itaú Empresas'], ana.id, CTA['Fundo fixo de obras'], CTA['Cartão corporativo']]);
    const rec = await one('SELECT id FROM recorrencias LIMIT 1');
    for (let m = 6; m >= 1; m--) {
      const base = new Date(H + 'T12:00:00Z'); base.setUTCMonth(base.getUTCMonth() - m);
      await lancarRecorrencia(rec.id, { mes: base.toISOString().slice(0, 7), valor: cent(12500), criado_por: 'Ana Paula Ribeiro', criado_por_id: ana.id });
    }
    // fecha o caixa dos dias já conferidos (até 3 dias atrás); os últimos dias ficam abertos
    await query("INSERT INTO fechamentos (data, obs, fechado_por, fechado_por_id) SELECT DISTINCT data, 'Conferido (demonstração)', 'Ana Paula Ribeiro', $2::bigint FROM lancamentos WHERE data <= $1::date", [d(-3), ana.id]);
    await query(`INSERT INTO fechamento_contas (data, conta_id, saldo_sistema)
      SELECT f.data, c.id, c.saldo_inicial + COALESCE((SELECT SUM(CASE l.tipo WHEN 'entrada' THEN l.valor ELSE -l.valor END) FROM lancamentos l WHERE l.conta_id = c.id AND l.data <= f.data), 0)
        + COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.data <= f.data), 0)
      FROM fechamentos f CROSS JOIN contas c WHERE c.ativo = 1`);

    // ---------- documentação ----------
    const pdf = await pdfExemplo('Documento de exemplo');
    const doc = async (obra, tipo, status, extra = {}, anexar = false) => DC.salvarDocumento(admin, obra, {
      tipo, status, ...extra, anexo: anexar && status === 'emitido' ? { nome: `${tipo.toLowerCase()}-exemplo.pdf`, base64: pdf.toString('base64') } : undefined,
    });
    for (const obra of [O.a, O.b, O.c, O.d, O.e, O.f]) await DC.gerarChecklist(admin, obra);
    const emit = (num, por, dias, validade) => ({ numero: num, emitido_por_id: por, emitido_em: d(dias), validade: validade ?? null });
    await doc(O.a, 'ART', 'emitido', emit('RJ20260012345 (fictício)', rodrigo, -175), true);
    await doc(O.a, 'CONTRATO', 'emitido', emit('Contrato 2026/001', null, -200), true);
    await doc(O.a, 'ALVARA', 'emitido', { ...emit('Alvará 2026/87123', null, -180, d(180)), emissor_externo: 'Prefeitura do Rio (SMU)' }, true);
    await doc(O.a, 'CNO', 'emitido', { ...emit('CNO 90.123.45678/70', null, -170), emissor_externo: 'Receita Federal' });
    await doc(O.a, 'PGR', 'emitido', { ...emit('PGR 2026-A', patricia, -165, d(18)), obs: 'Revisão anual próxima.' }, true);
    await doc(O.a, 'PCMSO', 'solicitado', { obs: 'Exames dos novos funcionários em andamento.' });
    await doc(O.a, 'SEGURO', 'emitido', { ...emit('Apólice 7781234', null, -160, d(200)), emissor_externo: 'Seguradora Exemplo' });
    await doc(O.a, 'MATRICULA', 'emitido', { ...emit('Matrícula 123456', null, -210), emissor_externo: '9º Ofício de Registro de Imóveis' });
    await doc(O.a, 'PROJETO_APROVADO', 'emitido', { ...emit('Processo 2026/0032', null, -190), emissor_externo: 'Prefeitura do Rio (SMU)' });
    await doc(O.b, 'ART', 'emitido', emit('RJ20260034567 (fictício)', rodrigo, -78), true);
    await doc(O.b, 'CONTRATO', 'emitido', emit('Contrato 2026/002', null, -140), true);
    await doc(O.b, 'ALVARA', 'solicitado', { obs: 'Protocolado na Prefeitura; aguardando vistoria.' });
    await doc(O.b, 'CNO', 'emitido', { ...emit('CNO 90.123.45999/71', null, -75), emissor_externo: 'Receita Federal' });
    await doc(O.b, 'PGR', 'emitido', emit('PGR 2026-B', patricia, -70, d(290)));
    await doc(O.c, 'ART', 'emitido', emit('RJ20260005678 (fictício)', camila, -205), true);
    await doc(O.c, 'CONTRATO', 'emitido', emit('Contrato 2025/118', null, -260), true);
    await doc(O.c, 'ALVARA', 'emitido', { ...emit('Alvará 2026/20111', null, -200, d(150)), emissor_externo: 'Prefeitura de Mangaratiba' });
    await doc(O.c, 'LICENCA_AMBIENTAL', 'emitido', { ...emit('LI 2026/044', null, -230, d(25)), emissor_externo: 'INEA' }, true);
    await doc(O.c, 'BOMBEIROS', 'solicitado', { obs: 'Projeto de hidrantes em análise.' });
    await doc(O.c, 'PGR', 'emitido', emit('PGR 2026-C', patricia, -200, d(150)));
    await doc(O.d, 'ART', 'emitido', emit('RJ20260022222 (fictício)', camila, -100), true);
    await doc(O.d, 'CONTRATO', 'emitido', emit('Contrato 2026/003', null, -150), true);
    await doc(O.d, 'ALVARA', 'emitido', { ...emit('Licença 2026/771', null, -105, d(-4)), emissor_externo: 'Prefeitura do Rio (SMU)' });
    await doc(O.e, 'ART', 'emitido', emit('RJ20260044444 (fictício)', camila, -50), true);
    await doc(O.e, 'CONTRATO', 'emitido', emit('Contrato 2026/004', null, -95), true);
    await doc(O.e, 'ALVARA', 'solicitado', { obs: 'Licença de publicidade (painel de LED) em análise.' });
    await doc(O.e, 'PGR', 'emitido', emit('PGR 2026-E', patricia, -48, d(310)));
    await doc(O.f, 'RRT', 'emitido', emit('SI1234567R10CT001 (fictício)', beatriz, -60), true);
    await doc(O.f, 'MATRICULA', 'emitido', { ...emit('Matrícula 998877', null, -90), emissor_externo: '10º Ofício de Registro de Imóveis' });
    await doc(O.f, 'PROJETO_APROVADO', 'solicitado', { obs: 'Projeto protocolado na Prefeitura.' });
    await DC.salvarDocumento(admin, O.g, { tipo: 'HABITESE', status: 'emitido', numero: 'Habite-se 2026/501', emitido_em: d(-52), emissor_externo: 'Prefeitura do Rio (SMU)' });

    // ---------- agenda e avisos ----------
    const evento = (obra, dias, hora, tipo, titulo, detalhe) => OB.salvarEvento({ id: diogo.id, papel: 'admin' }, obra, null, { data: d(dias), hora, tipo, titulo, detalhe });
    await evento(O.a, 0, '08:00', 'concretagem', 'Concretagem da laje da cobertura (14 m³)', 'Bomba lança agendada. Conferir slump e coletar corpos de prova.');
    await evento(O.c, 1, '09:00', 'vistoria', 'Vistoria do Corpo de Bombeiros', 'Levar o projeto de hidrantes impresso.');
    await evento(O.a, 1, '14:00', 'reuniao', 'Reunião com o cliente (escolha dos revestimentos)', null);
    await evento(O.e, 2, '08:00', 'entrega', 'Painel de LED chega da fábrica', 'Equipe da terceirizada acompanha a descarga.');
    await evento(O.d, 3, '15:00', 'entrega_cliente', 'Entrega parcial da piscina para o cliente', 'Vistoria final do deck.');
    await evento(O.c, 5, '08:00', 'medicao', 'Medição de campo — drenagem e pavimentação', null);
    await evento(O.b, 7, '09:00', 'concretagem', 'Concretagem das vigas baldrame — trecho 2', null);
    await evento(O.a, 9, '10:00', 'vistoria', 'Vistoria da seguradora', null);
    const aviso = (obra, para, titulo, texto, prioridade) => PN_criarAviso(obra, para, titulo, texto, prioridade);
    const PN_criarAviso = async (obra, para, titulo, texto, prioridade) => (await import('./painel.js')).criarAviso(admin, { obra_id: obra, para_usuario_id: para, titulo, texto, prioridade });
    await aviso(O.a, rodUser.id, 'Hoje chega o caminhão de concreto às 8h', 'Confirme a bomba e a equipe de apoio para a concretagem da laje da cobertura.', 'alta');
    await aviso(O.d, camUser.id, 'Cliente cobrou a entrega da piscina', 'Priorizar o revestimento. Me avise até sexta se o prazo novo é viável.', 'alta');
    await aviso(O.b, null, 'Lembrete: ART do alvará', 'Anexar a ART assim que sair o protocolo do alvará.', 'normal');

    // ---------- almoxarifado, ausências, patrimônio ----------
    const pedroU = { id: pedro.id, papel: 'estoque', nome: pedro.nome };
    const itens = {};
    for (const [nome, un, min] of [['Cimento CP-II 50 kg', 'sc', 200], ['Areia média', 'm³', 15], ['Brita 1', 'm³', 15], ['Vergalhão CA-50 10 mm', 'barra', 100], ['Capacete de segurança', 'un', 20], ['Luva de raspa', 'par', 40], ['Bota de segurança (par)', 'par', 15], ['Disco de corte 7"', 'un', 20], ['Prego 18x27 (kg)', 'kg', 10]]) itens[nome] = await ES.salvarItem(null, { nome, unidade: un, minimo: min });
    const ent = (nome, q, dias, ref) => ES.registrarMovimento({ item_id: itens[nome], tipo: 'entrada', quantidade: q, data: d(dias), referencia: ref }, pedroU);
    const sai = (nome, q, dias, obra) => ES.registrarMovimento({ item_id: itens[nome], tipo: 'saida', quantidade: q, data: d(dias), obra_id: obra }, pedroU);
    await ent('Cimento CP-II 50 kg', 600, -20, 'Depósito Barra Materiais'); await sai('Cimento CP-II 50 kg', 260, -12, O.a); await sai('Cimento CP-II 50 kg', 180, -6, O.c);
    await ent('Areia média', 40, -18, 'Depósito Barra Materiais'); await sai('Areia média', 18, -9, O.a);
    await ent('Brita 1', 40, -18, 'Depósito Barra Materiais'); await sai('Brita 1', 12, -9, O.a);
    await ent('Vergalhão CA-50 10 mm', 260, -25, 'Aço Rio Ferragens'); await sai('Vergalhão CA-50 10 mm', 190, -10, O.b);
    await ent('Capacete de segurança', 60, -60, 'Compra EPI'); await sai('Capacete de segurança', 44, -30, O.c);
    await ent('Luva de raspa', 120, -60, 'Compra EPI'); await sai('Luva de raspa', 96, -20, O.a);
    await ent('Bota de segurança (par)', 40, -60, 'Compra EPI'); await sai('Bota de segurança (par)', 31, -25, O.c);
    await ent('Disco de corte 7"', 50, -45, 'Compra'); await sai('Disco de corte 7"', 21, -15, O.e);
    await ent('Prego 18x27 (kg)', 30, -45, 'Compra'); await sai('Prego 18x27 (kg)', 12, -14, O.b);
    const aus = (f, tipo, ini, fim, obs) => DP.criarAusencia({ funcionario_id: f, tipo, data_inicio: d(ini), data_fim: d(fim), obs }, admin);
    await aus(serventes[2], 'atestado', -6, -4, 'Atestado médico'); await aus(pedreiros[3], 'ferias', 5, 19, 'Férias programadas'); await aus(peoes[0], 'falta', -3, -3, 'Falta sem justificativa'); await aus(eletricista, 'atestado', 0, 1, 'Consulta e repouso');
    const mesAtual = H.slice(0, 7); const mesAnt = P.mesAnterior(mesAtual);
    for (const mes of [mesAnt, mesAtual]) {
      await P.salvarItem(null, { mes, tipo: 'equipamento', descricao: 'Betoneiras 400 L (4 un)', valor: cent(32000), situacao: 'em_obra' }, admin);
      await P.salvarItem(null, { mes, tipo: 'equipamento', descricao: 'Andaimes fachadeiros próprios (1.200 m²)', valor: cent(96000), situacao: 'em_obra' }, admin);
      await P.salvarItem(null, { mes, tipo: 'equipamento', descricao: 'Retroescavadeira e caminhão basculante', valor: cent(610000), situacao: 'em_obra' }, admin);
      await P.salvarItem(null, { mes, tipo: 'equipamento', descricao: 'Ferramentas elétricas e geradores', valor: cent(58000), situacao: mes === mesAtual ? 'em_manutencao' : 'em_obra' }, admin);
      await P.salvarItem(null, { mes, tipo: 'estoque', descricao: 'Material estocado no depósito central', valor: cent(mes === mesAtual ? 96000 : 74000), situacao: 'no_deposito' }, admin);
    }
    await query("UPDATE socios SET data_entrada = $1 WHERE nome = 'Investidor Exemplo'", [d(-172)]);
  });
  return true;
}
