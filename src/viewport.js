// The screen views each keep their own camera. Printed figures use the full source coordinates.
(() => {
  'use strict';
  const canvas = document.getElementById('canvas');
  const drawings = [...canvas.querySelectorAll('svg.drawing-svg')];
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');
  const fit = document.getElementById('fit-view');
  const scale = document.getElementById('view-scale');
  const initial = new Map(drawings.map(svg => [svg, svg.getAttribute('viewBox')]));
  const minimum = 0.5, maximum = 4;
  let drag = null;

  const current = () => drawings.find(svg => !svg.hasAttribute('hidden'));
  const initialWidth = svg => Number(initial.get(svg).split(' ')[2]);
  const magnification = svg => initialWidth(svg) / svg.viewBox.baseVal.width;

  function updateToolbar() {
    const svg = current();
    const value = svg ? magnification(svg) : 1;
    zoomOut.disabled = !svg || value <= minimum + 1e-6;
    zoomIn.disabled = !svg || value >= maximum - 1e-6;
    fit.disabled = !svg;
    scale.value = svg ? Math.round(value * 100) + '%' : '—';
  }

  function zoom(factor, pointer) {
    const svg = current();
    if (!svg) return;
    const box = svg.viewBox.baseVal;
    const old = magnification(svg);
    const next = Math.max(minimum, Math.min(maximum, factor * old));
    const ratio = old / next;
    const center = pointer || {x:box.x + box.width / 2, y:box.y + box.height / 2};
    const x = center.x + (box.x - center.x) * ratio;
    const y = center.y + (box.y - center.y) * ratio;
    svg.setAttribute('viewBox', [x, y, box.width * ratio, box.height * ratio].join(' '));
    updateToolbar();
  }

  function fitDrawing() {
    const svg = current();
    if (svg) svg.setAttribute('viewBox', initial.get(svg));
    updateToolbar();
  }

  function reset() {
    for (const [svg, bounds] of initial) svg.setAttribute('viewBox', bounds);
    PrecastDrawings.resetOrbit();
    updateToolbar();
  }

  function panWithKey(svg, event) {
    if (svg.id === 'iso-view' && !event.shiftKey) return false;
    const step = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[event.key];
    if (!step) return false;
    const box = svg.viewBox.baseVal;
    svg.setAttribute('viewBox', [box.x + step[0] * box.width / 12, box.y + step[1] * box.height / 12, box.width, box.height].join(' '));
    return true;
  }

  zoomOut.addEventListener('click', () => zoom(0.8));
  zoomIn.addEventListener('click', () => zoom(1.25));
  fit.addEventListener('click', fitDrawing);
  canvas.closest('.drawing-area').addEventListener('keydown', event => {
    const svg = current();
    if (!svg || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case '+': case '=': zoom(1.25); break;
      case '-': zoom(0.8); break;
      case 'f': case 'F': fitDrawing(); break;
      default: if (event.target !== svg || !panWithKey(svg, event)) return;
    }
    event.preventDefault();
  });
  const visibility = new MutationObserver(updateToolbar);
  for (const svg of drawings) {
    visibility.observe(svg, {attributes:true, attributeFilter:['hidden']});
    svg.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      const screen = svg.getScreenCTM();
      if (!screen) return;
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(screen.inverse());
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const pixels = Math.max(-300, Math.min(300, event.deltaY * factor));
      zoom(Math.exp(-pixels / 400), anchor);
    }, {passive:false});
    svg.addEventListener('pointerdown', event => {
      const pans = event.button === 1 || (event.button === 0 && (svg.id !== 'iso-view' || event.shiftKey));
      if (!pans || drag) return;
      const screen = svg.getScreenCTM();
      if (!screen) return;
      event.preventDefault();
      svg.focus({preventScroll:true});
      svg.setPointerCapture(event.pointerId);
      const box = svg.viewBox.baseVal;
      drag = {id:event.pointerId, x:event.clientX, y:event.clientY, originX:box.x, originY:box.y, units:1/screen.a};
    });
    svg.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || !svg.hasPointerCapture(drag.id)) return;
      const box = svg.viewBox.baseVal;
      const x = drag.originX - (event.clientX - drag.x) * drag.units;
      const y = drag.originY - (event.clientY - drag.y) * drag.units;
      svg.setAttribute('viewBox', [x, y, box.width, box.height].join(' '));
    });
    svg.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) drag = null; });
  }
  window.PrecastViewport = Object.freeze({reset});
  updateToolbar();
})();
