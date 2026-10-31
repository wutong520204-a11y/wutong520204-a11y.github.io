/* Logistics formulas. Pure functions, no DOM. Works in browser (window.LogiCalc) and Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LogiCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Exact definitions
  var CM_PER_IN = 2.54;                 // international inch
  var KG_PER_LB = 0.45359237;           // international avoirdupois pound
  var M3_PER_FT3 = 0.028316846592;      // (0.3048 m)^3
  var CFT_PER_CBM = 1 / M3_PER_FT3;     // ≈ 35.3146667
  var KG_PER_T = 1000;

  var LENGTH_TO_M = { cm: 0.01, in: CM_PER_IN / 100, m: 1, mm: 0.001 };

  function num(x) { var n = Number(x); return isFinite(n) ? n : NaN; }
  function isPos(n) { return typeof n === 'number' && isFinite(n) && n > 0; }

  /** Volume of one box in m³. unit: 'cm' | 'in' | 'm' | 'mm' */
  function boxCbm(l, w, h, unit) {
    var f = LENGTH_TO_M[unit || 'cm'];
    if (!f) throw new Error('Unknown unit: ' + unit);
    l = num(l); w = num(w); h = num(h);
    if (!(l >= 0 && w >= 0 && h >= 0)) return NaN;
    return (l * f) * (w * f) * (h * f);
  }

  /**
   * lines: [{l,w,h,qty,unit,weight}] weight = gross kg per carton (optional)
   * Returns totals; invalid/empty lines are skipped.
   */
  function cbmTotal(lines, unit) {
    var cbm = 0, pieces = 0, weight = 0, used = 0;
    (lines || []).forEach(function (ln) {
      var u = ln.unit || unit || 'cm';
      var v = boxCbm(ln.l, ln.w, ln.h, u);
      var q = num(ln.qty === undefined || ln.qty === '' ? 1 : ln.qty);
      if (!isPos(v) || !(q > 0)) return;
      q = Math.floor(q);
      cbm += v * q; pieces += q; used++;
      var wt = num(ln.weight);
      if (wt > 0) weight += wt * q;
    });
    return { cbm: cbm, cft: cbm * CFT_PER_CBM, pieces: pieces, weightKg: weight, lines: used };
  }

  /**
   * Volumetric factors in kg per m³.
   * Air/express use a divisor on cm³: volumetric kg = L*W*H(cm)/divisor  => kg per m³ = 1e6/divisor.
   */
  var MODES = {
    air6000: { kgPerCbm: 1e6 / 6000, divisor: 6000 },   // ≈166.67 kg/m³ (IATA standard)
    air5000: { kgPerCbm: 1e6 / 5000, divisor: 5000 },   // 200 kg/m³
    express5000: { kgPerCbm: 1e6 / 5000, divisor: 5000 },
    sea: { kgPerCbm: 1000 },                           // W/M: 1 m³ = 1 t
    rail333: { kgPerCbm: 333 },                        // common rail/road convention, carrier specific
    road333: { kgPerCbm: 333 }
  };

  function roundUpTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }

  /** Chargeable weight. Returns kg values; sea also returns revenue tons (W/M). */
  function chargeable(cbm, actualKg, mode, customKgPerCbm) {
    cbm = num(cbm); actualKg = num(actualKg);
    if (!(cbm >= 0) || !(actualKg >= 0)) return null;
    var f = mode === 'custom' ? num(customKgPerCbm) : (MODES[mode] && MODES[mode].kgPerCbm);
    if (!isPos(f)) return null;
    var vol = cbm * f;
    var ch = Math.max(vol, actualKg);
    var res = {
      volumetricKg: vol, actualKg: actualKg, chargeableKg: ch,
      basis: vol > actualKg ? 'volume' : 'weight', kgPerCbm: f
    };
    if (mode === 'sea') res.revenueTons = Math.max(cbm, actualKg / 1000);
    if (/^air|^express/.test(mode)) res.chargeableRoundedKg = roundUpTo(ch, 0.5);
    return res;
  }

  /** Typical internal dimensions (m) and max payload (kg). Values vary by manufacturer/owner. */
  var CONTAINERS = {
    '20GP': { l: 5.898, w: 2.352, h: 2.393, payloadKg: 28200 },
    '40GP': { l: 12.032, w: 2.352, h: 2.393, payloadKg: 26700 },
    '40HQ': { l: 12.032, w: 2.352, h: 2.698, payloadKg: 26500 }
  };
  function containerCbm(type) { var c = CONTAINERS[type]; return c ? c.l * c.w * c.h : NaN; }

  /** Max cartons in a simple grid with one orientation (best of 6), ignoring door and voids. */
  function gridFit(cl, cw, ch, L, W, H) {
    var dims = [cl, cw, ch], best = 0;
    var perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    perms.forEach(function (p) {
      var n = Math.floor(L / dims[p[0]] + 1e-9) * Math.floor(W / dims[p[1]] + 1e-9) * Math.floor(H / dims[p[2]] + 1e-9);
      if (n > best) best = n;
    });
    return best;
  }

  /**
   * Container loading estimate.
   * carton: {l,w,h,unit,weight(kg per carton)}; utilization 0..1; qty optional cartons to ship.
   */
  function containerLoad(type, carton, utilization, qty, payloadOverrideKg) {
    var c = CONTAINERS[type]; if (!c) return null;
    var u = num(utilization);
    if (!(u > 0 && u <= 1)) return null;
    var unit = carton.unit || 'cm';
    var v = boxCbm(carton.l, carton.w, carton.h, unit);
    if (!isPos(v)) return null;
    var f = LENGTH_TO_M[unit];
    var dims = [num(carton.l) * f, num(carton.w) * f, num(carton.h) * f];
    var payload = isPos(num(payloadOverrideKg)) ? num(payloadOverrideKg) : c.payloadKg;
    var capCbm = containerCbm(type);
    var usableCbm = capCbm * u;
    var byVolume = Math.floor(usableCbm / v + 1e-9);
    var grid = gridFit(dims[0], dims[1], dims[2], c.l, c.w, c.h);
    if (grid === 0) byVolume = 0; // carton does not fit through internal dims at all
    var wt = num(carton.weight);
    var byWeight = wt > 0 ? Math.floor(payload / wt + 1e-9) : Infinity;
    var fit = Math.min(byVolume, byWeight);
    var res = {
      containerCbm: capCbm, usableCbm: usableCbm, cartonCbm: v, payloadKg: payload,
      byVolume: byVolume, byWeight: byWeight, gridFit: grid, estimate: fit,
      limitedBy: byWeight < byVolume ? 'weight' : 'volume',
      loadedCbm: fit * v, loadedKg: wt > 0 ? fit * wt : null
    };
    var q = Math.floor(num(qty));
    if (q > 0 && fit > 0) {
      res.qty = q;
      res.containersNeeded = Math.ceil(q / fit);
      res.shipmentCbm = q * v;
      res.shipmentKg = wt > 0 ? q * wt : null;
    }
    return res;
  }

  /**
   * FCL vs LCL.
   * cbm, kg: shipment; lclRate: per W/M (1 t = 1 m³); lclMin: minimum chargeable W/M (e.g. 1);
   * lclFixed: per-shipment LCL fees; fclPrice: per container all-in; type: container; utilization: 0..1
   */
  function fclVsLcl(o) {
    var cbm = num(o.cbm), kg = num(o.kg || 0), rate = num(o.lclRate), fcl = num(o.fclPrice);
    var min = num(o.lclMin || 0), fixed = num(o.lclFixed || 0);
    if (!(cbm > 0) || !(rate > 0) || !(fcl > 0) || !(kg >= 0)) return null;
    var wm = Math.max(cbm, kg / 1000, min);
    var lclCost = wm * rate + fixed;
    var c = CONTAINERS[o.type || '20GP'];
    var u = num(o.utilization || 0.85);
    var capCbm = containerCbm(o.type || '20GP') * u;
    var containers = Math.max(1, Math.ceil(cbm / capCbm - 1e-9), kg > 0 ? Math.ceil(kg / c.payloadKg - 1e-9) : 1);
    var fclCost = containers * fcl;
    var breakEvenWm = (fcl - fixed) / rate; // W/M at which one-container FCL = LCL
    return {
      wm: wm, lclCost: lclCost, fclCost: fclCost, containers: containers,
      breakEvenWm: breakEvenWm > 0 ? breakEvenWm : 0,
      capacityCbm: capCbm,
      cheaper: lclCost < fclCost ? 'LCL' : (lclCost > fclCost ? 'FCL' : 'equal'),
      savings: Math.abs(lclCost - fclCost)
    };
  }

  /** Unit conversions. */
  var FACTORS = {
    // to base unit: mass->kg, length->cm, volume->m3
    kg: ['mass', 1], lb: ['mass', KG_PER_LB], t: ['mass', KG_PER_T], g: ['mass', 0.001],
    cm: ['length', 1], in: ['length', CM_PER_IN], m: ['length', 100], ft: ['length', 30.48], mm: ['length', 0.1],
    cbm: ['volume', 1], cft: ['volume', M3_PER_FT3], l: ['volume', 0.001]
  };
  function convert(value, from, to) {
    var a = FACTORS[from], b = FACTORS[to], v = num(value);
    if (!a || !b || a[0] !== b[0]) throw new Error('Incompatible units ' + from + '→' + to);
    return v * a[1] / b[1];
  }

  return {
    CM_PER_IN: CM_PER_IN, KG_PER_LB: KG_PER_LB, CFT_PER_CBM: CFT_PER_CBM, M3_PER_FT3: M3_PER_FT3,
    MODES: MODES, CONTAINERS: CONTAINERS,
    boxCbm: boxCbm, cbmTotal: cbmTotal, chargeable: chargeable, roundUpTo: roundUpTo,
    containerCbm: containerCbm, gridFit: gridFit, containerLoad: containerLoad,
    fclVsLcl: fclVsLcl, convert: convert
  };
});
