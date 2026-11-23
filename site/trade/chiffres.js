// Gachiz : l'écriture des nombres, partagée par l'app (trade/) et la page Markets (markets/).
// Vrai signe moins (U+2212), décimales atténuées, jamais de « −0.00 ». Script classique : il pose window.gachizChiffres.
(() => {
  'use strict'
  const MOINS = '−'
  const arrondi = (v, dec = 2) => Math.round(v * 10 ** dec) / 10 ** dec
  function nombre(v, dec = 2, signe = false) {
    const r = arrondi(v, dec)
    const corps = Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    return (r < 0 ? MOINS : signe && r > 0 ? '+' : '') + corps
  }
  // Écrit un nombre dans un élément : la partie entière, puis les décimales dans un <span class="dec">.
  function ecrire(el, v, { dec = 2, signe = false, suffixe = '' } = {}) {
    const texte = nombre(v, dec, signe) + suffixe
    if (el.dataset.v === texte) return
    el.dataset.v = texte
    const point = texte.indexOf('.')
    if (point < 0) return el.replaceChildren(texte)
    const fin = document.createElement('span')
    fin.className = 'dec'
    fin.textContent = texte.slice(point, texte.length - suffixe.length)
    el.replaceChildren(texte.slice(0, point), fin, suffixe)
  }
  // Hausse en Zest, baisse en orange, zéro sans couleur.
  function ton(el, v) {
    const r = arrondi(v)
    el.classList.toggle('hausse', r > 0)
    el.classList.toggle('baisse', r < 0)
  }
  const deux = (n) => String(n).padStart(2, '0')
  function heure(t, secondes = true) {
    const d = new Date(t)
    return `${deux(d.getHours())}:${deux(d.getMinutes())}${secondes ? `:${deux(d.getSeconds())}` : ''}`
  }
  // Une petite courbe dans une toile. repere : une valeur tracée en pointillé (le zéro d'un PnL, le départ d'un indice).
  function courbe(toile, points, teinte, { repere = null, teinteRepere = teinte, epaisseur = 1.25 } = {}) {
    const l = toile.clientWidth || toile.width
    const h = toile.clientHeight || toile.height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (toile.width !== Math.round(l * dpr) || toile.height !== Math.round(h * dpr)) {
      toile.width = Math.round(l * dpr)
      toile.height = Math.round(h * dpr)
    }
    const ctx = toile.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, l, h)
    let haut = Math.max(...points)
    let bas = Math.min(...points)
    if (repere !== null) {
      haut = Math.max(haut, repere)
      bas = Math.min(bas, repere)
    }
    const y = (p) => 2 + (1 - (p - bas) / (haut - bas || 1)) * (h - 4)
    if (repere !== null) {
      ctx.strokeStyle = teinteRepere
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(0, Math.round(y(repere)) + 0.5)
      ctx.lineTo(l, Math.round(y(repere)) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (points.length < 2) return
    ctx.strokeStyle = teinte
    ctx.lineWidth = epaisseur
    ctx.lineJoin = 'round'
    ctx.beginPath()
    points.forEach((p, i) => {
      const px = 1 + (i / (points.length - 1)) * (l - 2)
      if (i) ctx.lineTo(px, y(p))
      else ctx.moveTo(px, y(p))
    })
    ctx.stroke()
  }
  // Les points d'une courbe de deux heures : un par minute, le dernier pas compris.
  function minutes(m) {
    const points = []
    for (let k = (m.ticks.length - 1) % 60; k < m.ticks.length; k += 60) points.push(m.ticks[k])
    return points
  }
  window.gachizChiffres = { arrondi, nombre, ecrire, ton, heure, courbe, minutes }
})()
