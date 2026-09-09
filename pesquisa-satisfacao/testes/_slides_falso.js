/** SlidesApp / DriveApp falsos: registram tudo que o gerador desenha. */
function criarSlidesApp(deckId, { largura = 720, altura = 405, slidesIniciais = 3 } = {}) {
  const registro = { formas: [], textos: [], linhas: [], imagens: [], removidos: 0, salvo: false, _seq: 0 };

  function novaForma(tipo, x, y, w, h, slide) {
    const f = {
      tipo, x, y, w, h, slide, _fill: null, _alpha: null, _border: null, _peso: null,
      getFill: () => ({
        setSolidFill: (c, a) => { f._fill = c; f._alpha = a; },
        setTransparent: () => { f._fill = null; }
      }),
      getBorder: () => ({
        getLineFill: () => ({ setSolidFill: c => { f._border = c; } }),
        setWeight: p => { f._peso = p; }, setTransparent: () => { f._border = null; }
      }),
      sendToBack: () => { f.ordem = -1; return f; },
      setContentAlignment: (v) => { f._middle = v; return f; },
      getText: () => {
        const t = {
          _texto: '', _fs: null, _bold: null, _cor: null, _fonte: null, _align: null, _line: null,
          setText(v) { t._texto = v; f.texto = v; registro.textos.push(f); return t; },
          getTextStyle: () => ({
            setFontSize(v) { t._fs = v; f.fs = v; return this; },
            setBold(v) { t._bold = v; f.bold = v; return this; },
            setForegroundColor(v) { t._cor = v; f.cor = v; return this; },
            setFontFamily(v) { t._fonte = v; f.fonte = v; return this; }
          }),
          getParagraphStyle: () => ({
            setParagraphAlignment(v) { t._align = v; f._align = v; return this; },
            setLineSpacing(v) { t._line = v; f._line = v; return this; }
          })
        };
        return t;
      }
    };
    return f;
  }

  function novoSlide(indice) {
    const s = {
      indice, removido: false,
      getBackground: () => ({ setSolidFill: c => { s.fundo = c; } }),
      insertShape(tipo, x, y, w, h) { const f = novaForma(tipo, x, y, w, h, indice); f.ordem = registro._seq++; registro.formas.push(f); return f; },
      insertLine(cat, x1, y1, x2, y2) {
        const l = { x1, y1, x2, y2, slide: indice, getLineFill: () => ({ setSolidFill: c => { l.cor = c; } }), setWeight: p => { l.peso = p; return l; } };
        l.ordem = registro._seq++; registro.linhas.push(l); return l;
      },
      insertImage(blob) {
        const img = { slide: indice, blob, _w: 400, _h: 120,
          getWidth: () => img._w, getHeight: () => img._h,
          setWidth(v) { img._w = v; return img; }, setHeight(v) { img._h = v; return img; },
          setLeft(v) { img.left = v; return img; }, setTop(v) { img.top = v; return img; } };
        img.ordem = registro._seq++; registro.imagens.push(img); return img;
      },
      remove() { s.removido = true; registro.removidos++; const i = deck._slides.indexOf(s); if (i >= 0) deck._slides.splice(i, 1); }
    };
    return s;
  }

  const deck = {
    _slides: [],
    getId: () => deckId,
    getUrl: () => 'https://docs.google.com/presentation/d/' + deckId,
    getPageWidth: () => largura,
    getPageHeight: () => altura,
    getSlides: () => deck._slides.slice(),
    appendSlide() { const s = novoSlide(deck._slides.length); deck._slides.push(s); return s; },
    saveAndClose() { registro.salvo = true; }
  };
  for (let i = 0; i < slidesIniciais; i++) deck.appendSlide();
  registro.iniciais = deck._slides.slice();

  return {
    SlidesApp: {
      openById: id => { if (id !== deckId) throw new Error('deck não encontrado: ' + id); return deck; },
      // create() devolve o mesmo deck falso: os testes trabalham com um só.
      create: nome => { registro.criados = (registro.criados || []).concat([nome]); return deck; },
      PredefinedLayout: { BLANK: 'BLANK' },
      ShapeType: { RECTANGLE: 'RECT', ROUND_RECTANGLE: 'ROUND', ELLIPSE: 'ELLIPSE', TEXT_BOX: 'TEXT_BOX' },
      LineCategory: { STRAIGHT: 'STRAIGHT' },
      ContentAlignment: { MIDDLE: 'MIDDLE' },
      ParagraphAlignment: { START: 'START', CENTER: 'CENTER', END: 'END' }
    },
    deck, registro
  };
}
module.exports = { criarSlidesApp };
