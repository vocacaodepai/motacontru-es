// Popula o banco configurado (DATABASE_URL ou o Postgres local embutido) com dados FICTÍCIOS de demonstração.
// Uso: npm run demo     (não faz nada se já houver obras cadastradas)
import { iniciar, modo } from './db.js';
import { seed } from './seed.js';
import { popularDemo } from './demo-mota.js';

await iniciar(seed);
const feito = await popularDemo();
console.log(feito ? `Dados fictícios da Mota Construções criados (${modo}).\nAcessos: diogo.mota, marcelo.mota, rodrigo.carvalho, camila.duarte, ana.financeiro, julia.comercial, investidor, pedro.estoque, bianca.marketing — senha ${process.env.DEMO_SENHA || 'mota2026'}.` : 'Já existem obras cadastradas: nada foi alterado.');
process.exit(0);
