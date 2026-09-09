/**
 * Prévia dos slides em SVG, sem abrir o Google Slides.
 * Uso:  node testes/previa.js [pasta-de-saida]
 * A quebra de linha e o ajuste de fonte sao estimados; o Slides faz o dele.
 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const {criarSlidesApp}=require('./_slides_falso');
const {svgDoSlide}=require('./_previa_svg');
const RAIZ=path.join(__dirname, '..'), DECK='1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI';
const {SlidesApp,registro}=criarSlidesApp(DECK,{slidesIniciais:0});
const p={abas:{},getSheetByName:n=>p.abas[n]||null,insertSheet(n){p.abas[n]=ab(n);return p.abas[n];}};
function ab(nome){const a={nome,dados:[],_g(l,c){while(a.dados.length<l)a.dados.push([]);const li=a.dados[l-1];while(li.length<c)li.push('');},clear(){a.dados=[];return a;},appendRow(x){a.dados.push(x.slice());return a;},getLastRow:()=>a.dados.length,getMaxRows:()=>a.dados.length,setFrozenRows:()=>a,autoResizeColumn:()=>a,setColumnWidth:()=>a,deleteRows(i,q){a.dados.splice(i-1,q);return a;},getDataRange:()=>({getValues:()=>a.dados.map(l=>l.slice())}),getRange(l,c){const f={setValues(v){v.forEach((lv,i)=>{a._g(l+i,c+lv.length-1);lv.forEach((x,j)=>{a.dados[l+i-1][c+j-1]=x;});});return f;},setValue(v){a._g(l,c);a.dados[l-1][c-1]=v;return f;},setBackground:()=>f,setFontColor:()=>f,setFontWeight:()=>f,setWrap:()=>f};return f;}};return a;}
let u=0;
const s={SpreadsheetApp:{openById:()=>p},SlidesApp,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty:()=>{}})},Logger:{log:()=>{}},MimeType:{CSV:'c'},DriveApp:{createFile:()=>({setSharing:()=>{},getUrl:()=>''}),getFileById:()=>({getBlob:()=>({})}),Access:{},Permission:{}},Utilities:{getUuid:()=>'u'+(++u),formatDate:(d,t,f)=>String(f).indexOf('HH:mm')>-1?'2026-08-20 10:00':'2026-08-20'},console};
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(RAIZ,'sheets.gs'),'utf8'),s);
vm.runInContext(fs.readFileSync(path.join(RAIZ,'apresentacao.gs'),'utf8'),s);
vm.runInContext('inserirDadosDeTeste();',s);

// inserirDadosDeTeste() grava o mesmo comentário para todo mundo, e a dedução
// de duplicatas colapsa a lista. Estes textos são inventados, só para a prévia
// mostrar os slides de comentários cheios.
const exemplos = [
  ['Responde rápido e sempre com contexto suficiente para a gente seguir sozinho.', 'Os prazos combinados nas reuniões nem sempre chegam por escrito depois.'],
  ['A qualidade dos relatórios melhorou muito no último semestre.', 'Falta um canal único de pedidos; hoje chega por e-mail, WhatsApp e no corredor.'],
  ['Parceria de verdade no planejamento anual, entram junto no problema.', 'Poderiam antecipar quando um pedido vai atrasar, em vez de avisar no dia.'],
  ['Documentação clara, dá para consultar depois sem precisar perguntar de novo.', 'O volume de reuniões de alinhamento poderia cair pela metade.'],
  ['Time acessível, nunca fui destratado ao pedir ajuda fora do escopo deles.', 'Alguns processos ainda dependem de uma pessoa específica estar disponível.'],
  ['Trazem dados para a discussão em vez de opinião.', 'Retorno de pedidos pequenos demora tanto quanto o de pedidos grandes.'],
  ['N/A', '...'],
  ['Sem apontamentos',
   'Como oportunidade de melhoria, acredito que a área pode se aproximar ainda mais das demais, ' +
   'buscando entender suas rotinas, dificuldades e necessidades. Também vejo espaço para comunicarmos ' +
   'melhor o que já é feito hoje, porque muita gente desconhece o alcance do trabalho e acaba pedindo ' +
   'coisas que já existem, ou cobrando prazos sem saber o que está na frente na fila. Um resumo mensal ' +
   'do que entrou, do que saiu e do que ficou para trás resolveria boa parte disso e custaria pouco.']
];
exemplos.forEach((par,i)=>{
  s.salvarResposta({ avaliacoes: [
    { area_avaliada:'Jurídico', is_autoavaliacao:true, respostas:{q0:'4'}, abertas:{} },
    { area_avaliada:'Planejamento & Gestão', is_autoavaliacao:false, respostas:{q0:'4'}, abertas:{ q7:par[0], q8:par[1] } }
  ]});
});

vm.runInContext("gerarApresentacaoDaArea('Planejamento & Gestão');",s);
const nomes=vm.runInContext("PRH_definirRoteiro_(PRH_montarModelo_(lerRespostas_(), 'Planejamento & Gestão'))",s).map(r=>r.titulo);
const out=process.argv[2]||path.join(__dirname,'..','previa');
fs.mkdirSync(out,{recursive:true});
let html='<style>body{background:#334;font-family:system-ui;margin:0;padding:24px}h2{color:#fff;font-size:14px;margin:18px 0 8px}svg{box-shadow:0 4px 18px #0006;display:block}</style>';
nomes.forEach((n,i)=>{ html+=`<h2>${i+1}. ${n}</h2>`+svgDoSlide(registro,i,720,405); });
fs.writeFileSync(out+'/previa-slides.html',html);
console.log('ok →',out+'/previa-slides.html');
