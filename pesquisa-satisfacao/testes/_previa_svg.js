/**
 * Converte o registro do SlidesApp falso em SVG, para ver o layout sem abrir
 * o Google Slides. Aproximação: o Slides quebra linha e ajusta fonte sozinho;
 * aqui a quebra é estimada pela largura da caixa.
 */
function escapar(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function quebrar(texto, larguraCaixa, fs) {
  const porLinha = Math.max(1, Math.floor((larguraCaixa - 6) / (fs * 0.52)));
  const saida = [];
  String(texto).split('\n').forEach(function (paragrafo) {
    let linha = '';
    paragrafo.split(' ').forEach(function (palavra) {
      if (!linha) { linha = palavra; return; }
      if ((linha + ' ' + palavra).length <= porLinha) linha += ' ' + palavra;
      else { saida.push(linha); linha = palavra; }
    });
    saida.push(linha);
  });
  return saida;
}

function svgDoSlide(registro, indice, W, H) {
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#F8FAFC"/>`];

  // Ordem de inserção = ordem de empilhamento, igual ao Google Slides.
  const desenhaveis = []
    .concat(registro.formas.filter(f => f.slide === indice && f.tipo !== 'TEXT_BOX').map(f => ({ ordem: f.ordem, tipo: 'forma', o: f })))
    .concat(registro.linhas.filter(l => l.slide === indice).map(l => ({ ordem: l.ordem, tipo: 'linha', o: l })))
    .concat(registro.imagens.filter(im => im.slide === indice).map(im => ({ ordem: im.ordem, tipo: 'imagem', o: im })))
    .sort((a, b) => a.ordem - b.ordem);

  desenhaveis.forEach(d => {
    const o = d.o;
    if (d.tipo === 'linha') {
      partes.push(`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.cor || '#999'}" stroke-width="${o.peso || 1}"/>`);
    } else if (d.tipo === 'imagem') {
      partes.push(`<rect x="${o.left}" y="${o.top}" width="${o._w}" height="${o._h}" fill="none" stroke="#CBD5E1" stroke-dasharray="3 3"/>` +
        `<text x="${o.left + o._w / 2}" y="${o.top + o._h / 2 + 3}" font-size="8" fill="#94A3B8" text-anchor="middle">logo</text>`);
    } else {
      const cor = o._fill || 'none';
      const op = o._alpha === null || o._alpha === undefined ? 1 : o._alpha;
      const borda = o._border ? ` stroke="${o._border}"` : '';
      if (o.tipo === 'ELLIPSE') {
        partes.push(`<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" fill="${cor}" opacity="${op}"${borda}/>`);
      } else {
        const r = o.tipo === 'ROUND' ? Math.min(o.h / 2, 12) : 0;
        partes.push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${r}" fill="${cor}" opacity="${op}"${borda}/>`);
      }
    }
  });

  registro.textos.filter(t => t.slide === indice).forEach(t => {
    const fs = t.fs || 11;
    const linhas = quebrar(t.texto, t.w, fs);
    const alturaTexto = linhas.length * fs * 1.25;
    // middle: centraliza no eixo vertical da caixa; senão, começa no topo.
    let y = t._middle ? t.y + (t.h - alturaTexto) / 2 + fs : t.y + fs;
    const ancora = t._align === 'CENTER' ? 'middle' : t._align === 'END' ? 'end' : 'start';
    const x = ancora === 'middle' ? t.x + t.w / 2 : ancora === 'end' ? t.x + t.w - 3 : t.x + 3;
    linhas.forEach(linha => {
      partes.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${fs}" text-anchor="${ancora}" ` +
        `fill="${t.cor || '#151E49'}" font-weight="${t.bold ? 700 : 400}" ` +
        `font-family="${t.fonte === 'Montserrat' ? 'Montserrat, Arial' : 'Arial'}, sans-serif">${escapar(linha)}</text>`);
      y += fs * 1.25;
    });
  });

  partes.push('</svg>');
  return partes.join('\n');
}

module.exports = { svgDoSlide };
