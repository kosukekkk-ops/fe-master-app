/* charts.js — 依存ライブラリなしの自前SVGチャート
 * オフライン要件のため外部CDNを使わず、SVGを文字列で組み立てる。
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // レーダーチャート: axes=[{label,value(0..1),color}]
  function radar(axes, size = 260) {
    const n = axes.length;
    // 軸が多い(=ラベルが多い)ほど外周の文字用マージンを広めに取り、はみ出しを防ぐ
    const margin = n > 6 ? 54 : 34;
    const cx = size / 2, cy = size / 2, r = size / 2 - margin;
    const pt = (i, rad) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    };
    let g = '';
    // grid rings
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const pts = axes.map((_, i) => pt(i, r * f).map(v => v.toFixed(1)).join(',')).join(' ');
      g += `<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
    });
    // spokes + labels
    axes.forEach((a, i) => {
      const [x, y] = pt(i, r);
      g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)"/>`;
      const [lx, ly] = pt(i, r + 18);
      const anchor = Math.abs(lx - cx) < 4 ? 'middle' : (lx > cx ? 'start' : 'end');
      g += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="var(--text-dim)">${esc(a.label)}</text>`;
      g += `<text x="${lx.toFixed(1)}" y="${(ly + 17).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="var(--text-dim)">${Math.round(a.value * 100)}%</text>`;
    });
    // data polygon
    const dpts = axes.map((a, i) => pt(i, r * Math.max(0.02, a.value)).map(v => v.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${dpts}" fill="rgba(79,157,255,.25)" stroke="var(--accent)" stroke-width="2"/>`;
    axes.forEach((a, i) => {
      const [x, y] = pt(i, r * Math.max(0.02, a.value));
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"/>`;
    });
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="${NS}" style="overflow:visible">${g}</svg>`;
  }

  // 横棒グラフ: items=[{label,value(0..1),color,note}]
  function bars(items, w = 320) {
    const rowH = 40, pad = 8;
    const h = items.length * rowH + pad * 2;
    const labelW = 90, barW = w - labelW - 46;
    let g = '';
    items.forEach((it, i) => {
      const y = pad + i * rowH + 8;
      const bw = Math.max(2, barW * it.value);
      g += `<text x="0" y="${y + 15}" font-size="12" fill="var(--text-dim)">${esc(it.label)}</text>`;
      g += `<rect x="${labelW}" y="${y}" width="${barW}" height="18" rx="9" fill="var(--bg-elev)"/>`;
      g += `<rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="18" rx="9" fill="${it.color || 'var(--accent)'}"/>`;
      g += `<text x="${w - 4}" y="${y + 15}" text-anchor="end" font-size="12" fill="var(--text)">${it.note || Math.round(it.value * 100) + '%'}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="${NS}">${g}</svg>`;
  }

  // 折れ線グラフ: points=[{label, value(0..1)}]
  function line(points, w = 320, h = 180) {
    if (!points.length) return '';
    const padL = 30, padR = 10, padT = 12, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const n = points.length;
    const xAt = (i) => padL + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const yAt = (v) => padT + ih * (1 - v);
    let g = '';
    // y gridlines 0/50/100
    [0, 0.5, 1].forEach(v => {
      const y = yAt(v);
      g += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      g += `<text x="0" y="${(y + 4).toFixed(1)}" font-size="9" fill="var(--text-dim)">${Math.round(v * 100)}</text>`;
    });
    const dp = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
    g += `<polyline points="${dp}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    points.forEach((p, i) => {
      g += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="3" fill="var(--accent)"/>`;
      if (n <= 8 || i % Math.ceil(n / 6) === 0) {
        g += `<text x="${xAt(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="var(--text-dim)">${esc(p.label)}</text>`;
      }
    });
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="${NS}">${g}</svg>`;
  }

  // ミニ折れ線(スパークライン): 数値配列を横幅いっぱいに引き伸ばして描く。軸なし。
  function sparkline(values, color = 'var(--accent)', h = 30) {
    if (!values.length) return '';
    const w = 120, max = Math.max(...values, 1), n = values.length;
    const xAt = (i) => n === 1 ? w / 2 : (w * i) / (n - 1);
    const yAt = (v) => (h - 3) - (h - 6) * (v / max);
    const pts = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
    const li = n - 1;
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="${NS}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">`
      + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<circle cx="${xAt(li).toFixed(1)}" cy="${yAt(values[li]).toFixed(1)}" r="2.6" fill="${color}"/></svg>`;
  }

  // ミニ棒グラフ: 数値配列を細い棒で描く。値が大きいほど不透明に。
  function sparkbars(values, color = 'var(--ok)', h = 30) {
    if (!values.length) return '';
    const w = 120, max = Math.max(...values, 1), n = values.length, gap = 2;
    const bw = (w - (n - 1) * gap) / n;
    let g = '';
    values.forEach((v, i) => {
      const bh = Math.max(2, (h - 2) * (v / max));
      g += `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${color}" opacity="${(0.35 + 0.65 * (v / max)).toFixed(2)}"/>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="${NS}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">${g}</svg>`;
  }

  return { radar, bars, line, sparkline, sparkbars };
})();
