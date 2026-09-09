/**
 * Prévia dos slides da apresentação da empresa, em SVG.
 * Uso:  node testes/previa_empresa.js [pasta-de-saida]
 * A quebra de linha e o ajuste de fonte são estimados; o Slides faz o dele.
 */
const fs = require('fs');
const path = require('path');
const { montarEmpresa } = require('./_empresa');
const { svgDoSlide } = require('./_previa_svg');

const a = montarEmpresa({ deck: { slidesIniciais: 0 } });
a.rodar('inserirDadosDeTeste()');
a.rodar('PRHE_gerarApresentacaoEmpresa()');

const roteiro = a.rodar('PRHE_definirRoteiro_(PRHE_montarModelo_(dadosDaEmpresa_()))');
const out = process.argv[2] || path.join(__dirname, '..', 'previa');
fs.mkdirSync(out, { recursive: true });

let html = '<style>body{background:#334;font-family:system-ui;margin:0;padding:24px}' +
  'h2{color:#fff;font-size:14px;margin:18px 0 8px}svg{box-shadow:0 4px 18px #0006;display:block}</style>';
roteiro.forEach((item, i) => {
  html += `<h2>${i + 1}. ${item.titulo}</h2>` + svgDoSlide(a.registro, i, 720, 405);
});
fs.writeFileSync(path.join(out, 'previa-empresa.html'), html);
console.log('ok →', path.join(out, 'previa-empresa.html'), '·', roteiro.length, 'slides');
