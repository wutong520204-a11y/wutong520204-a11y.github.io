/* UI wiring for calculators. Depends on calc.js (window.LogiCalc). */
(function () {
  'use strict';
  var C = window.LogiCalc;
  var I = JSON.parse(document.getElementById('i18n').textContent);
  var U = I.ui;
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var e = $(id); if (!e || e.value === '') return NaN; return Number(e.value); };
  function fmt(n, d) {
    if (n === Infinity) return U.unlimited;
    if (!isFinite(n)) return '—';
    return new Intl.NumberFormat(I.locale, { maximumFractionDigits: d === undefined ? 2 : d, minimumFractionDigits: 0 }).format(n);
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kpis(target, items) {
    target.innerHTML = items.map(function (it) {
      return '<div' + (it[2] ? ' class="main"' : '') + '><dt>' + escH(it[0]) + '</dt><dd>' + escH(it[1]) + '</dd></div>';
    }).join('');
  }
  function onInput(root, fn) { root.addEventListener('input', fn); root.addEventListener('change', fn); fn(); }
  var qs = new URLSearchParams(location.search);

  var tools = {
    'cbm-calculator': function () {
      var tbody = document.querySelector('#lines tbody');
      var count = 0;
      function addRow(v) {
        v = v || {}; count++;
        var tr = el('tr');
        var cell = function (cls, key, label, value, step) {
          return '<td class="' + cls + '" data-label="' + escH(label) + '"><input type="number" inputmode="decimal" min="0" step="' + (step || 'any') + '" data-k="' + key + '" aria-label="' + escH(label) + '" value="' + (value === undefined ? '' : value) + '"></td>';
        };
        tr.innerHTML = '<td class="n"></td>' +
          cell('d', 'l', U.length, v.l) + cell('d', 'w', U.width, v.w) + cell('d', 'h', U.height, v.h) +
          cell('q', 'qty', U.qty, v.qty === undefined ? 1 : v.qty, 1) + cell('wt', 'weight', U.weightPer, v.weight) +
          '<td class="v"></td><td class="rm"><button type="button" class="btn x" aria-label="' + escH(U.remove) + '">×</button></td>';
        tr.querySelector('button').addEventListener('click', function () { if (tbody.rows.length > 1) { tr.remove(); calc(); } });
        tbody.appendChild(tr);
      }
      function rows() {
        return Array.prototype.map.call(tbody.rows, function (tr) {
          var o = {}; tr.querySelectorAll('input').forEach(function (i) { o[i.dataset.k] = i.value; }); return o;
        });
      }
      function calc() {
        var unit = $('unit').value;
        Array.prototype.forEach.call(tbody.rows, function (tr, i) {
          tr.cells[0].textContent = '#' + (i + 1);
          var o = {}; tr.querySelectorAll('input').forEach(function (inp) { o[inp.dataset.k] = inp.value; });
          var r = C.cbmTotal([o], unit);
          tr.querySelector('.v').textContent = r.lines ? fmt(r.cbm, 4) + ' ' + U.u.cbm : '—';
        });
        var t = C.cbmTotal(rows(), unit);
        kpis($('out'), [
          [U.totalCbm, fmt(t.cbm, 3) + ' ' + U.u.cbm, true],
          [U.totalCft, fmt(t.cft, 2) + ' ' + U.u.cft],
          [U.totalPieces, fmt(t.pieces, 0)],
          [U.totalWeight, t.weightKg ? fmt(t.weightKg, 2) + ' ' + U.u.kg : '—']
        ]);
        var link = $('toCw'); var base = link.getAttribute('href').split('?')[0];
        link.setAttribute('href', base + (t.cbm > 0 ? '?vol=' + t.cbm.toFixed(4) + (t.weightKg ? '&kg=' + t.weightKg.toFixed(2) : '') : ''));
      }
      addRow({ l: 50, w: 40, h: 30, qty: 10, weight: 12 });
      addRow({ l: 60, w: 40, h: 40, qty: 5, weight: 18 });
      $('add').addEventListener('click', function () { addRow(); calc(); var ins = tbody.lastChild.querySelector('input'); if (ins) ins.focus(); });
      $('reset').addEventListener('click', function () { tbody.innerHTML = ''; addRow(); calc(); });
      onInput($('calc'), calc);
    },

    'chargeable-weight-calculator': function () {
      if (qs.get('vol')) { $('vol').value = qs.get('vol'); }
      if (qs.get('kg')) { $('kg').value = qs.get('kg'); }
      var modes = ['air6000', 'air5000', 'express5000', 'sea', 'rail333', 'road333'];
      function calc() {
        var mode = $('mode').value;
        $('custom').closest('.fld').style.display = mode === 'custom' ? '' : 'none';
        var vol = val('vol');
        if (!(vol > 0)) { var p = val('pcs'); vol = C.boxCbm(val('l'), val('w'), val('h'), 'cm') * (p > 0 ? Math.floor(p) : 1); }
        var kg = val('kg'); if (!(kg >= 0)) kg = 0;
        var r = C.chargeable(vol, kg, mode, val('custom'));
        if (!r || !isFinite(vol)) { kpis($('out'), []); $('basis').textContent = ''; $('cmp').innerHTML = ''; return; }
        var items = [
          [U.chargeable, fmt(r.chargeableKg, 2) + ' ' + U.u.kg, true],
          [U.volumetric, fmt(r.volumetricKg, 2) + ' ' + U.u.kg],
          [U.actual, fmt(r.actualKg, 2) + ' ' + U.u.kg],
          [U.volume, fmt(vol, 4) + ' ' + U.u.cbm]
        ];
        if (r.chargeableRoundedKg !== undefined) items.splice(1, 0, [U.rounded, fmt(r.chargeableRoundedKg, 1) + ' ' + U.u.kg]);
        if (r.revenueTons !== undefined) items.splice(1, 0, [U.revenueTons, fmt(r.revenueTons, 3) + ' W/M']);
        kpis($('out'), items);
        $('basis').textContent = r.basis === 'volume' ? U.basisVolume : U.basisWeight;
        var html = '<thead><tr><th>' + escH(U.mode) + '</th><th>' + escH(U.factor) + '</th><th>' + escH(U.volumetric) + '</th><th>' + escH(U.chargeable) + '</th></tr></thead><tbody>';
        modes.forEach(function (m) {
          var x = C.chargeable(vol, kg, m);
          html += '<tr' + (m === mode ? ' class="sel"' : '') + '><td>' + escH(U.modes[m]) + '</td><td>' + fmt(x.kgPerCbm, 2) + '</td><td>' + fmt(x.volumetricKg, 2) + ' ' + U.u.kg + '</td><td><strong>' + fmt(x.chargeableKg, 2) + ' ' + U.u.kg + '</strong></td></tr>';
        });
        $('cmp').innerHTML = html + '</tbody>';
      }
      onInput($('calc'), calc);
    },

    'container-loading-calculator': function () {
      function calc() {
        var carton = { l: val('l'), w: val('w'), h: val('h'), unit: $('unit').value, weight: val('kg') };
        var util = val('util') / 100, qty = val('qty'), pay = val('payload');
        var types = Object.keys(C.CONTAINERS);
        var res = types.map(function (t) { return C.containerLoad(t, carton, util, qty, pay); });
        if (!res[0]) { $('cmp').innerHTML = ''; $('note').textContent = ''; return; }
        var rowsDef = [
          [U.internalDims, function (r, t) { var c = C.CONTAINERS[t]; return fmt(c.l, 3) + ' × ' + fmt(c.w, 3) + ' × ' + fmt(c.h, 3); }],
          [U.internalCbm, function (r) { return fmt(r.containerCbm, 1) + ' ' + U.u.cbm; }],
          [U.usableCbm, function (r) { return fmt(r.usableCbm, 1) + ' ' + U.u.cbm; }],
          [U.maxPayload, function (r) { return fmt(r.payloadKg, 0) + ' ' + U.u.kg; }],
          [U.byVolume, function (r) { return fmt(r.byVolume, 0); }],
          [U.byWeight, function (r) { return fmt(r.byWeight, 0); }],
          [U.grid, function (r) { return fmt(r.gridFit, 0); }],
          [U.estimateFit, function (r) { return '<strong>' + fmt(r.estimate, 0) + '</strong>'; }, true],
          [U.limitedBy, function (r) { return r.limitedBy === 'weight' ? U.limWeight : U.limVolume; }],
          [U.loaded, function (r) { return fmt(r.loadedCbm, 1) + ' ' + U.u.cbm + (r.loadedKg !== null ? ' / ' + fmt(r.loadedKg, 0) + ' ' + U.u.kg : ''); }]
        ];
        if (qty > 0) rowsDef.push([U.containersNeeded, function (r) { return r.containersNeeded ? '<strong>' + fmt(r.containersNeeded, 0) + '</strong>' : '—'; }, true]);
        var html = '<thead><tr><th>' + escH(U.container) + '</th>' + types.map(function (t) { return '<th>' + t + '</th>'; }).join('') + '</tr></thead><tbody>';
        rowsDef.forEach(function (d) {
          html += '<tr' + (d[2] ? ' class="sel"' : '') + '><td>' + escH(d[0]) + '</td>' + res.map(function (r, i) { return '<td>' + d[1](r, types[i]) + '</td>'; }).join('') + '</tr>';
        });
        $('cmp').innerHTML = html + '</tbody>';
        $('note').textContent = res.every(function (r) { return r.gridFit === 0; }) ? U.noFit : '';
      }
      onInput($('calc'), calc);
    },

    'fcl-vs-lcl-calculator': function () {
      function calc() {
        var r = C.fclVsLcl({ cbm: val('cbm'), kg: val('kg') || 0, lclRate: val('rate'), lclMin: val('min') || 0, lclFixed: val('fixed') || 0, fclPrice: val('fcl'), type: $('type').value, utilization: (val('util') || 85) / 100 });
        if (!r) { kpis($('out'), []); $('rec').textContent = ''; return; }
        kpis($('out'), [
          [U.lclCost, fmt(r.lclCost, 2), r.cheaper === 'LCL'],
          [U.fclCost + ' (' + r.containers + ' × ' + $('type').value + ')', fmt(r.fclCost, 2), r.cheaper === 'FCL'],
          [U.wm, fmt(r.wm, 3) + ' W/M'],
          [U.breakEven, fmt(r.breakEvenWm, 2) + ' W/M'],
          [U.saves, fmt(r.savings, 2)]
        ]);
        $('rec').textContent = r.cheaper === 'LCL' ? U.recLCL : r.cheaper === 'FCL' ? U.recFCL : U.recEqual;
      }
      onInput($('calc'), calc);
    },

    'unit-converter': function () {
      document.querySelectorAll('fieldset[data-group]').forEach(function (fs) {
        var inputs = fs.querySelectorAll('input[data-unit]');
        function update(src) {
          var v = src.value === '' ? NaN : Number(src.value);
          inputs.forEach(function (i) {
            if (i === src) return;
            i.value = isFinite(v) ? String(Number(C.convert(v, src.dataset.unit, i.dataset.unit).toPrecision(8))) : '';
          });
        }
        inputs.forEach(function (i) { i.addEventListener('input', function () { update(i); }); });
        inputs[0].value = '1'; update(inputs[0]);
      });
    }
  };
  var fn = tools[document.body.dataset.tool];
  if (fn) fn();
})();
