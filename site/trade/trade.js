// Gachiz : l'app de trading, en démo.
// Aucune source de prix n'existe : chaque indice est simulé dans le navigateur (indice.js, marche aléatoire à graine
// fixe, en points). Les ordres sont du papier : positions, PnL, limites, stops, objectifs de sortie et liquidations sont
// calculés sur l'indice simulé ; le carnet, les échanges et les volumes sont dessinés à partir de lui. Rien n'est
// envoyé on-chain. Le connect (../commun.js) est réel et en lecture seule.
'use strict'
document.documentElement.classList.add('js')
const $ = (id) => document.getElementById(id)
const borne = (x, a, b) => Math.min(b, Math.max(a, x))
const I = window.gachizIndice
const T = window.gachizTerminal
const { MARCHES, parCode } = I
const { arrondi, nombre, ecrire, ton, heure, courbe, minutes } = window.gachizChiffres
const calme = () => T.calme()
const tape = () => T.tape()
const dire = (titre, texte, genre) => window.gachiz.dire(titre, { texte: texte || '', type: genre || 'info' })

// ---------- Hypothèses de démo : aucune n'est un fait du produit ----------
const DEMO = {
  credits: 10000, // crédits simulés au départ
  levierMax: 10, // la course du curseur ; le levier du produit n'est pas annoncé
  maintien: 0.025, // marge de maintien, en part de la valeur : elle fixe le prix de liquidation de la démo
  margeMin: 10,
  ouvertsMax: 8, // positions, ou ordres en attente, à la fois
}
function piece(balise, classe, texte) {
  const el = document.createElement(balise)
  if (classe) el.className = classe
  if (texte) el.textContent = texte
  return el
}
// La vignette d'un marché : la petite image de son pack (../packs/mini/), à hauteur donnée, largeur libre.
function vignette(m, hauteur) {
  const img = document.createElement('img')
  img.src = `../packs/mini/${m.pack}.webp`
  img.alt = ''
  img.className = 'vignette'
  img.style.height = `px`
  return img
}
function icone(nom, taille) {
  const img = document.createElement('img')
  img.src = `../icons/${nom}.webp`
  img.alt = ''
  img.width = img.height = taille
  return img
}
const nomSens = (s) => (s === 'long' ? 'Long' : 'Short')
const NOMS_TYPE = { marche: 'Market', limite: 'Limit', stop: 'Stop', tp: 'Target', sl: 'Stop loss' }

// ---------- Le compte de démo ----------
const compte = { solde: DEMO.credits, positions: [], ordres: [], passes: [], echanges: [], realise: 0, volume: 0, volumes: {}, equite: [] }
let suite = 1
let marche = MARCHES[0]
const sensDe = (s) => (s === 'long' ? 1 : -1)
const pnlDe = (p, prix) => p.qte * (prix - p.entree) * sensDe(p.sens)
const resteDe = (p, prix) => ((prix - p.liq) * sensDe(p.sens)) / prix // la place avant la liquidation, en part du prix
const liqDe = (sens, prix, levier) => prix * (1 - sensDe(sens) * (1 / levier - DEMO.maintien))
function totaux() {
  let pris = 0
  let latent = 0
  for (const p of compte.positions) {
    pris += p.marge
    latent += pnlDe(p, parCode[p.code].prix)
  }
  for (const o of compte.ordres) pris += o.marge
  return { pris, latent, total: compte.solde + pris + latent }
}
function noterEchange(code, sens, action, via, prix, qte, pnl) {
  const valeur = qte * prix
  compte.echanges.unshift({ t: Date.now(), code, sens, action, via, prix, qte, valeur, pnl })
  if (compte.echanges.length > 200) compte.echanges.pop()
  compte.volume += valeur
  compte.volumes[code] = (compte.volumes[code] || 0) + valeur
  rendreEchanges()
}
function noterOrdre(o, prix, statut) {
  compte.passes.unshift({ t: Date.now(), code: o.code, sens: o.sens, type: o.type, prix, valeur: o.valeur, reduire: o.reduire, statut })
  if (compte.passes.length > 200) compte.passes.pop()
  rendrePasses()
}
function ouvrir(m, sens, marge, levier, prix, via, dejaReserve, tp, sl) {
  const taille = marge * levier
  if (!dejaReserve) compte.solde -= marge
  compte.positions.unshift({ id: suite++, code: m.code, sens, marge, levier, taille, qte: taille / prix, entree: prix, liq: liqDe(sens, prix, levier), tp: tp || null, sl: sl || null, trace: [0], neuf: true })
  noterEchange(m.code, sens, 'Open', via, prix, taille / prix, null)
  rendrePositions()
  rendreOrdres()
  if (m === marche) tournerPack(sens)
}
// Ferme une position, en entier ou en partie (part entre 0 et 1). Rend le PnL réalisé.
function fermer(p, prix, via, part = 1) {
  const liquidee = via === 'Liquidation'
  const tout = part >= 0.999
  const qte = tout ? p.qte : p.qte * part
  const marge = tout ? p.marge : p.marge * part
  let net = qte * (prix - p.entree) * sensDe(p.sens)
  if (liquidee || net < -marge) net = -marge
  compte.solde += marge + net
  compte.realise += net
  if (tout) compte.positions.splice(compte.positions.indexOf(p), 1)
  else {
    p.qte -= qte
    p.marge -= marge
    p.taille = p.qte * p.entree
  }
  if (edition && edition.id === p.id && tout) edition = null
  noterEchange(p.code, p.sens, liquidee ? 'Liquidation' : tout ? 'Close' : 'Reduce', via, prix, qte, net)
  rendrePositions()
  rendreOrdres()
  if (p.code === marche.code) tournerPack(p.sens === 'long' ? 'short' : 'long')
  return net
}
// Un ordre « reduce only » : il ferme les positions du sens opposé sur ce marché, la plus ancienne d'abord.
function reduire(m, sens, valeur, prix, via) {
  let reste = valeur
  let fait = 0
  for (const p of [...compte.positions].reverse()) {
    if (p.code !== m.code || p.sens === sens || reste <= 0.005) continue
    const part = Math.min(1, reste / p.taille)
    const pris = p.taille * part
    fermer(p, prix, via, part)
    reste -= pris
    fait += pris
  }
  return fait
}
// Exécute un ordre au prix donné, et le range dans l'historique des ordres.
function executer(o, prix, via) {
  const m = parCode[o.code]
  if (o.reduire) {
    const fait = reduire(m, o.sens, o.valeur, prix, via)
    noterOrdre(o, prix, fait > 0 ? 'Filled' : 'Rejected: nothing to reduce')
    return fait > 0
  }
  ouvrir(m, o.sens, o.marge, o.levier, prix, via, o.reserve, o.tp, o.sl)
  noterOrdre(o, prix, 'Filled')
  return true
}
function annuler(o, statut = 'Cancelled') {
  compte.solde += o.marge
  compte.ordres.splice(compte.ordres.indexOf(o), 1)
  noterOrdre(o, o.prix, statut)
  rendreOrdres()
}
// Après chaque pas de l'indice : ordres en attente, objectifs et stops, liquidations, puis les courbes.
function surPas() {
  for (const o of [...compte.ordres]) {
    const prix = parCode[o.code].prix
    const haut = prix >= o.prix
    const touche = o.type === 'limite' ? (o.sens === 'long' ? !haut || prix === o.prix : haut) : o.sens === 'long' ? haut : prix <= o.prix
    if (!touche) continue
    compte.ordres.splice(compte.ordres.indexOf(o), 1)
    const au = o.type === 'limite' ? o.prix : prix // une limite s'exécute à son prix, un stop au prix du pas
    const fait = executer({ ...o, reserve: true }, au, NOMS_TYPE[o.type])
    if (!fait) compte.solde += o.marge
    rendreOrdres()
    if (fait) dire(`${NOMS_TYPE[o.type]} order filled`, `${o.code} ${o.sens} at ${nombre(au)} pts.`, 'valide')
    else dire(`${NOMS_TYPE[o.type]} order rejected`, `${o.code}: nothing left to reduce.`, 'alerte')
  }
  for (const p of [...compte.positions]) {
    const prix = parCode[p.code].prix
    const s = sensDe(p.sens)
    if (p.tp && (prix - p.tp) * s >= 0) {
      const net = fermer(p, p.tp, 'Target')
      dire(`Target hit: ${p.code} ${p.sens}`, `Closed at ${nombre(p.tp)} pts, ${nombre(net, 2, true)} credits.`, 'valide')
      continue
    }
    if ((prix - p.liq) * s <= 0) {
      const net = fermer(p, p.liq, 'Liquidation')
      dire(`Liquidated: ${p.code} ${p.sens}`, `${nombre(net)} credits. Demo credits only.`, 'alerte')
      continue
    }
    if (p.sl && (prix - p.sl) * s <= 0) {
      const net = fermer(p, prix, 'Stop loss')
      dire(`Stop loss: ${p.code} ${p.sens}`, `Closed at ${nombre(prix)} pts, ${nombre(net, 2, true)} credits.`)
      continue
    }
    p.trace.push(pnlDe(p, prix))
    if (p.trace.length > 90) p.trace.shift()
  }
  compte.equite.push(totaux().total)
  if (compte.equite.length > 3600) compte.equite.shift()
}
function remettre() {
  Object.assign(compte, { solde: DEMO.credits, positions: [], ordres: [], passes: [], echanges: [], realise: 0, volume: 0, volumes: {}, equite: [] })
  edition = null
  rendrePositions()
  rendreOrdres()
  rendrePasses()
  rendreEchanges()
  rafraichir()
  dire('Demo account reset', `${nombre(DEMO.credits)} demo credits, no position, no order.`)
}
document.addEventListener('gachiz:remise', remettre)

// ---------- Couleurs de la DA, lues dans la feuille de style ----------
const styleRacine = getComputedStyle(document.documentElement)
const couleur = (nom) => styleRacine.getPropertyValue(`--${nom}`).trim()
const C = Object.fromEntries(['bg', 'sheet', 'div-1', 'div-2', 'div-3', 'text-1', 'text-2', 'text-3', 'zest', 'down', 'on-zest', 'noir'].map((n) => [n, couleur(n)]))
const POLICE = '600 10.5px Saira, sans-serif'

// ---------- Le pack du marché, en vraie 3D (../packs3d.js). Sans WebGL, son image reste en place. ----------
const scenePack = $('scene-pack')
const sceneRepli = $('scene-repli')
const fichePack = (m) => ({ face: `../packs/${m.pack}.webp`, dos: `../packs/${m.pack}-dos.webp` })
let pack3d = null
function tournerPack(sens) {
  if (calme()) return
  if (pack3d) return pack3d.tourner(sens === 'long' ? 1 : -1)
  sceneRepli.classList.remove('tourne')
  void sceneRepli.offsetWidth
  sceneRepli.classList.add('tourne')
}
import('../packs3d.js')
  .then((m) => (typeof m.monterUn === 'function' ? m.monterUn(scenePack, fichePack(marche), { fond: C.bg, noir: C.noir, zest: C.zest, papier: C['text-1'], trait: C['div-3'] }) : null))
  .then((p) => {
    if (!p) return
    pack3d = p
    scenePack.classList.add('gl')
    if (scenePack.dataset.pack !== MARCHES[0].pack) p.changer(fichePack(marche)) // le marché a changé pendant le chargement
  })
  .catch(() => {})

// ---------- Graphique : bougies ou courbe, volumes simulés, moyenne mobile, viseur, lignes du compte ----------
const graphe = { boite: $('graphe'), toile: $('toile-graphe'), l: 0, h: 0, dpr: 1, pas: 5, genre: 'bougies', mm: false, vol: true, auto: true, liste: [], cle: '', affiche: marche.prix, survol: null, image: 0 }
graphe.ctx = graphe.toile.getContext('2d')
const legende = { o: $('lg-o'), h: $('lg-h'), l: $('lg-l'), c: $('lg-c'), v: $('lg-var'), mm: $('lg-mm'), vol: $('lg-vol') }
const MM = 20
function tailler() {
  const r = graphe.boite.getBoundingClientRect()
  graphe.dpr = Math.min(window.devicePixelRatio || 1, 2)
  graphe.l = Math.round(r.width)
  graphe.h = Math.round(r.height)
  graphe.toile.width = Math.round(graphe.l * graphe.dpr)
  graphe.toile.height = Math.round(graphe.h * graphe.dpr)
  graphe.cle = ''
  demander()
}
function dessiner() {
  const g = graphe
  const ctx = g.ctx
  const L = g.l
  const H = g.h
  if (!L || !H) return
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
  ctx.clearRect(0, 0, L, H)
  const AXE = 60
  const BAS = 20
  const HAUT = 28
  const VOL = g.vol ? Math.min(52, Math.round(H * 0.16)) : 0
  const zl = L - AXE
  const zh = H - BAS - HAUT - VOL
  const etroit = L < 520
  let pasX = etroit ? 5 : 7
  let corps = etroit ? 3 : 5
  const max = Math.max(12, Math.floor((zl - 14) / pasX))
  const cle = `${marche.code}|${g.pas}|${I.tDernier}|${max}`
  if (cle !== g.cle) {
    g.tout = I.bougies(marche, g.pas, max + MM) // vingt bougies de plus, pour que la moyenne mobile parte du bord
    g.liste = g.tout.slice(-max)
    g.cle = cle
  }
  const liste = g.liste
  if (!liste.length) return
  if (liste.length < max) {
    // Moins de bougies que de place (les deux heures gardées, en bougies de 2 minutes) : elles s'élargissent.
    pasX = Math.min(16, Math.floor((zl - 14) / liste.length))
    corps = Math.max(3, Math.floor(pasX * 0.62) | 1)
  }
  const dernier = liste.length - 1
  const decale = g.tout.length - liste.length
  const cloture = g.affiche
  let haut = -Infinity
  let bas = Infinity
  let volMax = 1
  if (g.auto) {
    for (const b of liste) {
      if (b.h > haut) haut = b.h
      if (b.l < bas) bas = b.l
    }
  } else {
    const r = I.resume(marche) // échelle fixe : toute la fenêtre de deux heures
    haut = r.haut
    bas = r.bas
  }
  for (const b of liste) if (b.v > volMax) volMax = b.v
  const jeu = (haut - bas) * 0.12 || haut * 0.002
  haut += jeu
  bas -= jeu
  const y = (p) => HAUT + ((haut - p) / (haut - bas)) * zh
  const x = (i) => zl - 9 - (corps - 1) / 2 - (dernier - i) * pasX
  ctx.font = POLICE
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1

  // Le prix courant et le viseur se placent d'abord : leurs étiquettes passent devant celles des axes.
  const yPrix = Math.round(y(cloture)) + 0.5
  const s = g.survol
  const viseur = s && s.x < zl && s.y > HAUT - 6 && s.y < H - BAS ? { i: borne(Math.round((s.x - x(0)) / pasX), 0, dernier), cy: Math.round(s.y) + 0.5 } : null
  if (viseur) viseur.cx = Math.round(x(viseur.i)) + 0.5
  const libre = (yy) => Math.abs(yy - yPrix) > 13 && (!viseur || Math.abs(yy - viseur.cy) > 13)

  // La grille et l'axe des points.
  const brut = (haut - bas) / 5
  const ordre = 10 ** Math.floor(Math.log10(brut))
  const grad = [1, 2, 2.5, 5, 10].map((k) => k * ordre).find((v) => v >= brut)
  ctx.textAlign = 'right'
  for (let p = Math.ceil(bas / grad) * grad; p < haut; p += grad) {
    const yy = Math.round(y(p)) + 0.5
    if (yy < HAUT - 4) continue
    ctx.strokeStyle = C['div-1']
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(zl, yy)
    ctx.stroke()
    if (!libre(yy)) continue
    ctx.fillStyle = C['text-3']
    ctx.fillText(nombre(p), L - 8, yy)
  }
  // L'axe du temps.
  const chaque = Math.ceil(92 / pasX)
  ctx.textAlign = 'center'
  liste.forEach((b, i) => {
    if (b.seau % chaque !== 0) return
    const xx = Math.round(x(i)) + 0.5
    if (xx < 30 || xx > zl - 26) return
    ctx.strokeStyle = C['div-1']
    ctx.beginPath()
    ctx.moveTo(xx, HAUT - 6)
    ctx.lineTo(xx, H - BAS)
    ctx.stroke()
    if (viseur && Math.abs(xx - viseur.cx) < 56) return
    ctx.fillStyle = C['text-3']
    ctx.fillText(heure(b.t, g.pas < 60), xx, H - BAS / 2 + 1)
  })
  ctx.strokeStyle = C['div-1']
  ctx.beginPath()
  ctx.moveTo(zl + 0.5, 0)
  ctx.lineTo(zl + 0.5, H)
  ctx.moveTo(0, H - BAS + 0.5)
  ctx.lineTo(zl, H - BAS + 0.5)
  if (VOL) {
    ctx.moveTo(0, H - BAS - VOL + 0.5)
    ctx.lineTo(zl, H - BAS - VOL + 0.5)
  }
  ctx.stroke()

  // Les volumes simulés, en barres sous les bougies.
  if (VOL) {
    ctx.globalAlpha = 0.5
    liste.forEach((b, i) => {
      const c = i === dernier ? cloture : b.c
      const hb = Math.max(1, Math.round((b.v / volMax) * (VOL - 6)))
      ctx.fillStyle = c >= b.o ? C.zest : C.down
      ctx.fillRect(Math.round(x(i)) - (corps - 1) / 2, H - BAS - hb, corps, hb)
    })
    ctx.globalAlpha = 1
  }
  // Les bougies (hausse en Zest, baisse en orange), ou la courbe des clôtures.
  if (g.genre === 'bougies') {
    liste.forEach((b, i) => {
      const c = i === dernier ? cloture : b.c
      ctx.fillStyle = c >= b.o ? C.zest : C.down
      const cx = Math.round(x(i))
      const y1 = Math.round(y(Math.max(b.h, c)))
      const y2 = Math.round(y(Math.min(b.l, c)))
      ctx.fillRect(cx, y1, 1, Math.max(1, y2 - y1))
      const yo = Math.round(y(Math.max(b.o, c)))
      const yc = Math.round(y(Math.min(b.o, c)))
      ctx.fillRect(cx - (corps - 1) / 2, yo, corps, Math.max(1, yc - yo))
    })
  } else {
    ctx.strokeStyle = C.zest
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    liste.forEach((b, i) => {
      const yy = y(i === dernier ? cloture : b.c)
      if (i) ctx.lineTo(x(i), yy)
      else ctx.moveTo(x(i), yy)
    })
    ctx.stroke()
    ctx.lineWidth = 1
  }
  // La moyenne mobile des vingt dernières clôtures.
  const moyenne = (i) => {
    const fin = i + decale
    if (fin < MM - 1) return null
    let somme = 0
    for (let k = fin - MM + 1; k <= fin; k++) somme += k === g.tout.length - 1 ? cloture : g.tout[k].c
    return somme / MM
  }
  if (g.mm) {
    ctx.strokeStyle = C['text-2']
    ctx.beginPath()
    let trace = false
    liste.forEach((b, i) => {
      const v = moyenne(i)
      if (v === null) return
      if (trace) ctx.lineTo(x(i), y(v))
      else ctx.moveTo(x(i), y(v))
      trace = true
    })
    ctx.stroke()
  }

  // Les lignes du compte sur ce marché : entrée en trait plein, le reste en pointillé.
  const ligne = (p, teinte, pointille, texte) => {
    if (!p || p <= bas || p >= haut) return
    const yy = Math.round(y(p)) + 0.5
    ctx.strokeStyle = teinte
    ctx.setLineDash(pointille ? [4, 4] : [])
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(zl, yy)
    ctx.stroke()
    ctx.setLineDash([])
    const large = Math.ceil(ctx.measureText(texte).width) + 12
    ctx.fillStyle = C.bg
    ctx.fillRect(8, yy - 8.5, large, 17)
    ctx.strokeRect(8.5, yy - 8, large - 1, 16)
    ctx.fillStyle = teinte
    ctx.textAlign = 'left'
    ctx.fillText(texte, 14, yy + 0.5)
  }
  for (const o of compte.ordres) if (o.code === marche.code) ligne(o.prix, C['text-3'], true, `${NOMS_TYPE[o.type]} ${o.sens}`)
  for (const p of compte.positions) {
    if (p.code !== marche.code) continue
    ligne(p.liq, C.down, true, 'Liq.')
    ligne(p.sl, C.down, true, 'SL')
    ligne(p.tp, C.zest, true, 'TP')
    ligne(p.entree, C['text-2'], false, `${nomSens(p.sens)} ${p.levier}× entry`)
  }

  // Le prix courant : un pointillé et son étiquette sur l'axe.
  const teinte = cloture >= liste[dernier].o ? C.zest : C.down
  ctx.strokeStyle = teinte
  ctx.globalAlpha = 0.7
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(0, yPrix)
  ctx.lineTo(zl, yPrix)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.fillStyle = teinte
  ctx.fillRect(zl + 1, yPrix - 9.5, AXE - 1, 19)
  ctx.fillStyle = C['on-zest']
  ctx.textAlign = 'right'
  ctx.fillText(nombre(cloture), L - 8, yPrix + 0.5)

  // Le viseur.
  let vise = null
  if (viseur) {
    vise = liste[viseur.i]
    const { cx, cy } = viseur
    ctx.strokeStyle = C['div-3']
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(cx, HAUT - 6)
    ctx.lineTo(cx, H - BAS)
    if (cy < H - BAS - VOL) {
      ctx.moveTo(0, cy)
      ctx.lineTo(zl, cy)
    }
    ctx.stroke()
    ctx.setLineDash([])
    if (cy < H - BAS - VOL) {
      ctx.fillStyle = C.sheet
      ctx.fillRect(zl + 1, cy - 9.5, AXE - 1, 19)
      ctx.strokeRect(zl + 0.5, cy - 9, AXE - 1, 18)
      ctx.fillStyle = C['text-1']
      ctx.textAlign = 'right'
      ctx.fillText(nombre(haut - ((s.y - HAUT) / zh) * (haut - bas)), L - 8, cy + 0.5)
    }
    const texte = heure(vise.t)
    const large = Math.ceil(ctx.measureText(texte).width) + 12
    const gauche = borne(Math.round(cx - large / 2), 0, zl - large)
    ctx.fillStyle = C.sheet
    ctx.fillRect(gauche, H - BAS + 2, large, 17)
    ctx.strokeRect(gauche + 0.5, H - BAS + 2.5, large - 1, 16)
    ctx.fillStyle = C['text-1']
    ctx.textAlign = 'center'
    ctx.fillText(texte, gauche + large / 2, H - BAS + 11)
  }
  // La légende : la bougie visée, sinon la dernière.
  const b = vise || liste[dernier]
  const fin = vise ? b.c : cloture
  ecrire(legende.o, b.o)
  ecrire(legende.h, Math.max(b.h, fin))
  ecrire(legende.l, Math.min(b.l, fin))
  ecrire(legende.c, fin)
  ecrire(legende.v, (fin / b.o - 1) * 100, { signe: true, suffixe: '%' })
  ton(legende.v, (fin / b.o - 1) * 100)
  ecrire(legende.vol, b.v, { dec: 0 })
  const mm = g.mm ? moyenne(vise ? viseur.i : dernier) : null
  if (mm !== null) ecrire(legende.mm, mm)
  // La dernière bougie, dans l'en-tête du marché.
  const der = liste[dernier]
  ecrire($('st-bougie'), (cloture / der.o - 1) * 100, { signe: true, suffixe: '%' })
  ton($('st-bougie'), (cloture / der.o - 1) * 100)
}
const stPrix = $('st-prix')
function demander() {
  if (!graphe.image) graphe.image = requestAnimationFrame(image)
}
function image() {
  graphe.image = 0
  const ecart = marche.prix - graphe.affiche
  if (calme() || Math.abs(ecart) < 0.006) graphe.affiche = marche.prix
  else {
    graphe.affiche += ecart * 0.22 // le prix glisse vers sa valeur au lieu de sauter
    demander()
  }
  dessiner()
  ecrire(stPrix, graphe.affiche)
}
graphe.toile.addEventListener('pointermove', (e) => {
  const r = graphe.toile.getBoundingClientRect()
  graphe.survol = { x: e.clientX - r.left, y: e.clientY - r.top }
  demander()
})
const quitter = () => {
  graphe.survol = null
  demander()
}
graphe.toile.addEventListener('pointerleave', quitter)
graphe.toile.addEventListener('pointercancel', quitter)
new ResizeObserver(tailler).observe(graphe.boite)
// Les outils du graphique.
function bascule(id, depart, surChange) {
  const b = $(id)
  b.setAttribute('aria-pressed', String(depart))
  b.addEventListener('click', () => {
    const actif = b.getAttribute('aria-pressed') !== 'true'
    b.setAttribute('aria-pressed', String(actif))
    tape()
    surChange(actif)
  })
  return b
}
bascule('outil-mm', false, (v) => {
  graphe.mm = v
  $('lg-mm-boite').hidden = !v
  demander()
})
bascule('outil-vol', true, (v) => {
  graphe.vol = v
  $('lg-vol-boite').hidden = !v
  demander()
})
bascule('outil-auto', true, (v) => {
  graphe.auto = v
  demander()
})
const centre = $('centre')
const boutonPlein = $('outil-plein')
function agrandir(v) {
  centre.classList.toggle('plein', v)
  boutonPlein.setAttribute('aria-pressed', String(v))
  boutonPlein.textContent = v ? 'Exit' : 'Expand'
}
boutonPlein.addEventListener('click', () => {
  tape()
  agrandir(!centre.classList.contains('plein'))
})

// ---------- Curseurs qui glissent : segments, marchés, onglets ----------
const placeurs = []
function segments(el, choisir) {
  const boutons = [...el.querySelectorAll('button')]
  const curseur = el.querySelector('.segments-curseur')
  const placer = () => {
    const b = boutons.find((x) => x.getAttribute('aria-pressed') === 'true')
    curseur.style.width = `${b.offsetWidth}px`
    curseur.style.transform = `translateX(${b.offsetLeft}px)`
  }
  const regler = (v, muet) => {
    for (const b of boutons) b.setAttribute('aria-pressed', String(b.dataset.v === v))
    el.dataset.v = v
    placer()
    if (!muet) choisir(v)
  }
  for (const b of boutons) {
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') !== 'true') tape()
      regler(b.dataset.v)
    })
  }
  placeurs.push(placer)
  return regler
}

// ---------- Marchés : un tableau, deux lignes par indice ; recherche, tri, épingle ; la fiche du marché ----------
const listeCorps = $('liste-corps')
const listeBoite = $('liste-boite')
const curseurMarche = listeBoite.querySelector('.marches-curseur')
const table = listeCorps.parentNode
listeCorps.remove()
for (const m of MARCHES) {
  const paire = piece('tbody', 'paire')
  paire.tabIndex = 0
  paire.dataset.code = m.code
  paire.setAttribute('role', 'button')
  paire.setAttribute('aria-label', `${m.code}, ${m.nom}`)
  const haut = piece('tr', 'ligne-marche')
  const ep = piece('button', 'epingle')
  ep.type = 'button'
  ep.setAttribute('aria-label', `Pin ${m.code}`)
  ep.setAttribute('aria-pressed', String(T.epingles.has(m.code)))
  ep.addEventListener('click', (e) => {
    e.stopPropagation()
    T.basculerEpingle(m.code)
    ep.setAttribute('aria-pressed', String(T.epingles.has(m.code)))
    rangerMarches()
  })
  const c1 = piece('td', 'col-ep')
  c1.append(ep)
  const c2 = piece('td')
  const qui = piece('span', 'qui')
  qui.append(vignette(m, 24), piece('b', '', m.code))
  c2.append(qui)
  m.elPrix = piece('td', 'num')
  m.elVar = piece('td', 'num')
  haut.append(c1, c2, m.elPrix, m.elVar)
  const bas = piece('tr', 'ligne-detail')
  const cd = piece('td')
  cd.colSpan = 4
  const detail = piece('div', 'detail')
  m.trace = piece('canvas')
  m.trace.width = 64
  m.trace.height = 16
  m.trace.setAttribute('aria-hidden', 'true')
  m.elHaut = piece('b')
  m.elBas = piece('b')
  const h = piece('span', '', 'H ')
  h.append(m.elHaut)
  const l = piece('span', '', 'L ')
  l.append(m.elBas)
  detail.append(m.trace, h, l)
  cd.append(detail)
  bas.append(cd)
  paire.append(haut, bas)
  m.paire = paire
  const choisir = () => {
    if (m !== marche) tape()
    choisirMarche(m)
  }
  paire.addEventListener('click', choisir)
  paire.addEventListener('keydown', (e) => {
    if (e.target !== paire || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    choisir()
  })
}
const triMarches = T.tri($('liste-tete'), null, () => rangerMarches())
const cherche = $('cherche')
function rangerMarches() {
  const mot = cherche.value.trim().toLowerCase()
  let liste = MARCHES.filter((m) => !mot || m.code.toLowerCase().includes(mot) || m.nom.toLowerCase().includes(mot))
  liste = T.trier(liste, triMarches, (m, cle) => (cle === 'code' ? m.code : cle === 'prix' ? m.prix : m.prix / m.ticks[0]))
  liste.sort((a, b) => Number(T.epingles.has(b.code)) - Number(T.epingles.has(a.code))) // les épinglés d'abord
  for (const m of MARCHES) m.paire.remove()
  table.append(...liste.map((m) => m.paire))
  $('liste-vide').hidden = liste.length > 0
  placerMarche()
}
cherche.addEventListener('input', rangerMarches)
function placerMarche() {
  const b = marche.paire
  const visible = b.isConnected && b.offsetHeight > 0
  curseurMarche.style.height = `${visible ? b.offsetHeight : 0}px`
  curseurMarche.style.width = `${visible ? b.offsetWidth : 0}px`
  if (visible) curseurMarche.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`
}
placeurs.push(placerMarche)
function choisirMarche(m, muet) {
  marche = m
  for (const autre of MARCHES) autre.paire.setAttribute('aria-pressed', String(autre === m))
  $('entete-code').textContent = m.code
  $('entete-ligne').textContent = m.nom
  $('entete-icone').src = `../packs/mini/${m.pack}.webp`
  $('fiche-icone').src = `../packs/mini/${m.pack}.webp`
  $('fiche-nom').textContent = m.nom
  $('fiche-suit').textContent = m.suit
  $('scene-code').textContent = m.code
  sceneRepli.src = `../packs/${m.pack}.webp`
  scenePack.dataset.pack = m.pack
  if (pack3d) pack3d.changer(fichePack(m))
  graphe.affiche = m.prix
  graphe.cle = ''
  nommerGroupes()
  placerMarche()
  if (!muet) m.paire.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  rafraichir()
}

// ---------- Carnet et échanges : dessinés à partir de l'indice simulé, jamais de vrais ordres ----------
const livre = { ventes: [], achats: [], n: 0, groupe: 1, prix: $('livre-prix'), ecart: $('livre-ecart'), echanges: $('echanges'), vu: 0, place: 8 }
const carnet = $('carnet')
const cranDe = (m) => Math.max(0.1, Math.round(m.prix * 0.0016) / 10) // l'écart de base entre deux niveaux, en points
function nommerGroupes() {
  for (const b of $('groupe').querySelectorAll('button')) b.textContent = (cranDe(marche) * Number(b.dataset.v)).toFixed(1)
  placeurs.forEach((p) => p())
}
function monterLivre(n) {
  if (n === livre.n) return
  livre.n = n
  for (const [nom, cote] of [['ventes', 'vente'], ['achats', 'achat']]) {
    livre[nom] = []
    const lignes = []
    for (let i = 0; i < n; i++) {
      const li = piece('li', `niveau niveau-${cote}`)
      const l = { li, barre: piece('span', 'niveau-barre'), prix: piece('span', 'niveau-prix'), taille: piece('span'), total: piece('span', 'gris') }
      li.append(l.barre, l.prix, l.taille, l.total)
      li.addEventListener('click', () => viserPrix(Number(li.dataset.prix)))
      livre[nom].push(l)
      lignes.push(li)
    }
    $(`livre-${nom}`).replaceChildren(...lignes)
  }
}
// Le nombre de niveaux suit la hauteur : le carnet prend ce qu'il faut, les échanges gardent au moins cinq lignes.
function mesurerCarnet() {
  const h = carnet.clientHeight
  if (!h) return
  const fixe = 2 * 34 + 2 * 20 + 26 // deux en-têtes, deux rangées de libellés, le milieu
  const etroit = matchMedia('(max-width: 900px)').matches
  const n = etroit ? 6 : borne(Math.floor((h - fixe - 5 * 20) / 40), 3, 12)
  livre.place = etroit ? 12 : Math.max(3, Math.floor((h - fixe - n * 40) / 20))
  monterLivre(n)
  majCarnet()
}
new ResizeObserver(mesurerCarnet).observe(carnet)
function majCarnet() {
  const m = marche
  if (!livre.n) return
  const cran = cranDe(m) * livre.groupe
  const lot = Math.floor(I.tDernier / 4000) // les tailles tiennent quatre secondes
  const bords = { ventes: [Math.ceil((m.prix + cranDe(m) / 2) / cran - 1e-9), 1], achats: [Math.floor((m.prix - cranDe(m) / 2) / cran + 1e-9), -1] }
  const niveaux = {}
  let plein = 0
  for (const nom of ['ventes', 'achats']) {
    let cumul = 0
    niveaux[nom] = livre[nom].map((_, i) => {
      const n = bords[nom][0] + bords[nom][1] * i
      const taille = Math.round(((60 + 900 * I.grain(m.graine, n * livre.groupe, lot) ** 2) * (1 + i * 0.3) * livre.groupe) / 10) * 10
      cumul += taille
      return { prix: arrondi(n * cran), taille, cumul }
    })
    plein = Math.max(plein, cumul)
  }
  for (const nom of ['ventes', 'achats']) {
    niveaux[nom].forEach((d, i) => {
      const l = livre[nom][i]
      ecrire(l.prix, d.prix)
      ecrire(l.taille, d.taille, { dec: 0 })
      ecrire(l.total, d.cumul, { dec: 0 })
      l.barre.style.transform = `scaleX(${(d.cumul / plein).toFixed(3)})`
      l.li.dataset.prix = d.prix.toFixed(2)
    })
  }
  ecrire(livre.prix, m.prix)
  ton(livre.prix, m.prix - m.ticks[m.ticks.length - 2])
  ecrire(livre.ecart, niveaux.ventes[0].prix - niveaux.achats[0].prix, { suffixe: ' spread' })
  // Les échanges : un ou deux par pas, du côté où l'indice vient de bouger ; leur taille vient du volume simulé du pas.
  const n = m.ticks.length
  const fin = Math.floor(I.tDernier / 1000)
  const lignes = []
  for (let k = n - 1; k > n - 40 && lignes.length < livre.place; k--) {
    const t = fin - (n - 1 - k)
    const combien = I.grain(m.graine, t, 71) > 0.62 ? 2 : 1
    for (let j = 0; j < combien && lignes.length < livre.place; j++) {
      const monte = m.ticks[k] > m.ticks[k - 1] || (m.ticks[k] === m.ticks[k - 1] && I.grain(m.graine, t, 73 + j) > 0.5)
      const li = piece('li', `niveau echange ${monte ? 'niveau-achat' : 'niveau-vente'}`)
      const prix = piece('span', 'niveau-prix')
      const taille = piece('span')
      const part = combien === 2 ? (j ? 0.38 : 0.62) : 1
      ecrire(prix, m.ticks[k])
      ecrire(taille, Math.max(10, Math.round((m.vols[k] * part) / 10) * 10), { dec: 0 })
      li.append(prix, taille, piece('span', 'gris', heure(t * 1000)))
      if (t > livre.vu && livre.vu && !calme()) li.classList.add('neuf')
      lignes.push(li)
    }
  }
  livre.vu = fin
  livre.echanges.replaceChildren(...lignes)
}

// ---------- Ticket d'ordre : marché, limite, stop ; reduce only ; objectif de sortie et stop de protection ----------
const ticket = { sens: 'long', type: 'marche', levier: 5, reduire: false, tpsl: false, touche: {} }
const champ = { marge: $('marge'), prix: $('prix'), tp: $('tp'), sl: $('sl') }
const champLevier = $('levier')
const envoi = $('envoi')
function lire(c) {
  const texte = c.value.replace(/,/g, '.').trim()
  if (texte === '') return null
  return /^\d*\.?\d*$/.test(texte) && texte !== '.' ? Number(texte) : NaN
}
const opposees = () => compte.positions.filter((p) => p.code === marche.code && p.sens !== ticket.sens)
const aReduire = () => opposees().reduce((somme, p) => somme + p.taille, 0)
// Les prix de sortie d'une position : l'objectif du bon côté, le stop entre la liquidation et le prix.
function sortiesFausses(sens, ref, liq, tp, sl) {
  const s = sensDe(sens)
  if (tp !== null && !((tp - ref) * s > 0)) return ['tp', `Target sits ${s > 0 ? 'above' : 'below'} ${nombre(ref)} for a ${sens}.`]
  if (sl !== null && !((ref - sl) * s > 0 && (sl - liq) * s > 0)) return ['sl', `Stop loss sits between the liquidation price and ${nombre(ref)}.`]
  return null
}
function valider() {
  const v = { ok: true, err: '', champ: null, valeur: lire(champ.marge), prix: null, tp: null, sl: null, attend: false }
  const faux = (c, message) => {
    if (!v.err) Object.assign(v, { err: message, champ: c })
  }
  const m = marche
  if (ticket.type !== 'marche') {
    v.prix = lire(champ.prix)
    if (v.prix === null) v.ok = false
    else if (!(v.prix > 0)) faux('prix', 'Enter a price in points, above 0.')
    else if (ticket.type === 'limite') v.attend = ticket.sens === 'long' ? v.prix < m.prix : v.prix > m.prix // sinon elle part au marché
    else if (ticket.sens === 'long' ? v.prix <= m.prix : v.prix >= m.prix) faux('prix', `A ${ticket.sens} stop sits ${ticket.sens === 'long' ? 'above' : 'below'} the index.`)
    else v.attend = true
  }
  if (v.valeur === null) v.ok = false
  else if (!(v.valeur > 0)) faux('marge', 'Enter a number above 0.')
  else if (ticket.reduire) {
    const total = aReduire()
    if (!total) faux('marge', `Reduce only: no ${ticket.sens === 'long' ? 'short' : 'long'} position on ${m.code}.`)
    else if (v.valeur > total + 0.005) faux('marge', `Reduce only: at most ${nombre(total)} credits of value.`)
  } else if (v.valeur < DEMO.margeMin) faux('marge', `Minimum ${DEMO.margeMin} credits.`)
  else if (v.valeur > compte.solde + 1e-9) faux('marge', `Not enough demo credits. Available: ${nombre(compte.solde)}.`)
  v.entree = v.attend && v.prix > 0 ? v.prix : m.prix
  if (ticket.tpsl && !ticket.reduire) {
    v.tp = lire(champ.tp)
    v.sl = lire(champ.sl)
    for (const c of ['tp', 'sl']) if (Number.isNaN(v[c]) || v[c] === 0) faux(c, 'Enter a price in points, or leave it empty.')
    const pb = v.err ? null : sortiesFausses(ticket.sens, v.entree, liqDe(ticket.sens, v.entree, ticket.levier), v.tp, v.sl)
    if (pb) faux(pb[0], pb[1])
  }
  if (!v.err && (v.attend ? compte.ordres : ticket.reduire ? [] : compte.positions).length >= DEMO.ouvertsMax) faux('marge', `Demo limit: ${DEMO.ouvertsMax} ${v.attend ? 'open orders' : 'open positions'} at once.`)
  if (v.err) v.ok = false
  return v
}
// La jauge : la place qui reste avant la liquidation, en part du prix. Pleine à 25 %.
function reglerJauge(el, part) {
  el.firstElementChild.style.transform = `scaleX(${borne(part / 0.25, 0.03, 1).toFixed(3)})`
  el.classList.toggle('proche', part < 0.02)
  el.classList.toggle('moyenne', part >= 0.02 && part < 0.05)
}
function majTicket() {
  const v = valider()
  const montre = v.err && ticket.touche[v.champ]
  $('erreur').hidden = !montre
  if (montre) $('erreur').textContent = v.err
  for (const c of ['marge', 'prix', 'tp', 'sl']) {
    const faux = Boolean(montre && v.champ === c)
    $(`champ-${c}`).classList.toggle('est-faux', faux)
    champ[c].setAttribute('aria-invalid', String(faux))
  }
  const valeur = v.valeur > 0 ? v.valeur : 0
  const taille = ticket.reduire ? valeur : valeur * ticket.levier
  const place = 1 / ticket.levier - DEMO.maintien
  $('r-entree-nom').textContent = v.attend ? (ticket.type === 'stop' ? 'Entry at stop, est.' : 'Entry at limit') : 'Entry, est.'
  ecrire($('r-entree'), v.entree, { suffixe: ' pts' })
  ecrire($('r-taille'), taille)
  ecrire($('r-qte'), taille / v.entree, { dec: 4 })
  if (ticket.reduire) $('r-liq').textContent = 'n/a'
  else {
    delete $('r-liq').dataset.v
    ecrire($('r-liq'), liqDe(ticket.sens, v.entree, ticket.levier), { suffixe: ' pts' })
  }
  ecrire($('r-apres'), ticket.reduire ? compte.solde : compte.solde - valeur)
  $('marge-liq').hidden = ticket.reduire
  ecrire($('j-val'), place * 100, { dec: 1, suffixe: '%' })
  reglerJauge($('j-ticket'), place)
  if (envoi.getAttribute('aria-busy')) return
  envoi.disabled = !v.ok
  envoi.classList.toggle('est-short', ticket.sens === 'short')
  const quoi = ticket.reduire ? 'Reduce' : 'Open'
  envoi.textContent = v.attend ? `Place ${NOMS_TYPE[ticket.type].toLowerCase()} ${ticket.sens}` : `${quoi} ${ticket.sens} ${marche.code}`
}
function reglerLevier(n) {
  ticket.levier = borne(Math.round(n), 1, DEMO.levierMax)
  champLevier.value = String(ticket.levier)
  champLevier.style.setProperty('--rempli', `${((ticket.levier - 1) / (DEMO.levierMax - 1)) * 100}%`)
  champLevier.setAttribute('aria-valuetext', `${ticket.levier} times`)
  $('levier-val').textContent = `${ticket.levier}×`
  for (const b of document.querySelectorAll('[data-levier]')) b.setAttribute('aria-pressed', String(Number(b.dataset.levier) === ticket.levier))
  majTicket()
}
// L'accusé : une ligne sous le bouton, avec l'icône du sens, qui confirme l'ordre papier.
const accuse = $('accuse')
let accuseFin
function accuser(sens, texte) {
  $('accuse-icone').src = `../icons/${sens}.webp`
  $('accuse-texte').textContent = texte
  $('ticket-note').hidden = true
  accuse.hidden = false
  clearTimeout(accuseFin)
  accuseFin = setTimeout(() => {
    accuse.hidden = true
    $('ticket-note').hidden = false
  }, 3600)
}
function envoyer() {
  if (envoi.getAttribute('aria-busy') || !valider().ok) return
  envoi.setAttribute('aria-busy', 'true')
  envoi.textContent = 'Placing'
  setTimeout(() => {
    envoi.removeAttribute('aria-busy')
    const v = valider()
    if (!v.ok) {
      majTicket()
      return dire('Order not placed', 'The ticket changed. Check it and try again.', 'alerte')
    }
    const o = {
      id: suite++, code: marche.code, sens: ticket.sens, type: ticket.type, prix: v.prix, reduire: ticket.reduire,
      marge: ticket.reduire ? 0 : v.valeur, levier: ticket.levier, valeur: ticket.reduire ? v.valeur : v.valeur * ticket.levier,
      tp: v.tp, sl: v.sl, t: Date.now(), neuf: true,
    }
    const nom = NOMS_TYPE[ticket.type]
    if (v.attend) {
      compte.solde -= o.marge
      compte.ordres.unshift(o)
      rendreOrdres()
      choisirOnglet('ordres')
      accuser(o.sens, `${nom} ${o.sens} waiting at ${nombre(o.prix)} pts`)
      dire(`${nom} ${o.sens} placed`, `${o.code} at ${nombre(o.prix)} pts. It waits in Open orders.`, 'valide')
    } else {
      executer({ ...o, type: 'marche' }, marche.prix, 'Market')
      choisirOnglet('positions')
      accuser(o.sens, `${o.reduire ? 'Reduced' : `Paper ${o.sens} open`} at ${nombre(marche.prix)} pts`)
      dire(o.reduire ? `Position reduced` : `Paper ${o.sens} opened`, `${o.code} at ${nombre(marche.prix)} pts${o.reduire ? '' : `, ${o.levier}×`}. Nothing was sent on-chain.`, 'valide')
    }
    rafraichir()
  }, calme() ? 0 : 320)
}
const reglerSens = segments($('sens'), (v) => {
  ticket.sens = v
  majTicket()
})
const reglerType = segments($('type'), (v) => {
  ticket.type = v
  $('champ-prix').hidden = v === 'marche'
  $('saisies').classList.toggle('a-deux', v !== 'marche')
  $('prix-nom').textContent = v === 'stop' ? 'Stop, pts' : 'Limit, pts'
  if (v !== 'marche' && champ.prix.value === '') champ.prix.value = marche.prix.toFixed(2)
  majTicket()
})
segments($('pas'), (v) => {
  graphe.pas = Number(v)
  graphe.cle = ''
  demander()
})
segments($('genre'), (v) => {
  graphe.genre = v
  demander()
})
segments($('groupe'), (v) => {
  livre.groupe = Number(v)
  majCarnet()
})
bascule('opt-reduire', false, (v) => {
  ticket.reduire = v
  $('marge-nom').textContent = v ? 'Value to reduce, credits' : 'Margin, credits'
  $('levier-bloc').classList.toggle('est-coupe', v)
  $('opt-tpsl').disabled = v
  $('tpsl').hidden = v || !ticket.tpsl
  majTicket()
})
bascule('opt-tpsl', false, (v) => {
  ticket.tpsl = v
  $('tpsl').hidden = !v
  majTicket()
})
function viserPrix(prix) {
  if (!(prix > 0)) return
  tape()
  if (ticket.type === 'marche') reglerType('limite')
  champ.prix.value = prix.toFixed(2)
  ticket.touche.prix = true
  majTicket()
}
for (const [nom, c] of Object.entries(champ)) {
  c.addEventListener('input', () => {
    ticket.touche[nom] = true
    majTicket()
  })
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') envoyer()
  })
}
champLevier.addEventListener('input', () => reglerLevier(Number(champLevier.value)))
for (const b of document.querySelectorAll('[data-levier]')) b.addEventListener('click', () => reglerLevier(Number(b.dataset.levier)))
for (const b of document.querySelectorAll('[data-part]')) {
  b.addEventListener('click', () => {
    const plafond = ticket.reduire ? aReduire() : compte.solde
    champ.marge.value = (Math.floor(plafond * Number(b.dataset.part)) / 100).toFixed(2)
    ticket.touche.marge = true
    majTicket()
  })
}
envoi.addEventListener('click', envoyer)

// ---------- Bas : onglets et tableaux ----------
const onglets = $('onglets')
const curseurOnglet = onglets.querySelector('.onglets-curseur')
const lesOnglets = [...onglets.querySelectorAll('[role="tab"]')]
let ongletCourant = 'positions'
function placerOnglet() {
  const b = lesOnglets.find((x) => x.getAttribute('aria-selected') === 'true')
  curseurOnglet.style.width = `${b.offsetWidth - 18}px`
  curseurOnglet.style.transform = `translateX(${b.offsetLeft + 9}px)`
}
placeurs.push(placerOnglet)
function choisirOnglet(nom, avecFocus) {
  ongletCourant = nom
  for (const b of lesOnglets) {
    const choisi = b.id === `o-${nom}`
    b.setAttribute('aria-selected', String(choisi))
    b.tabIndex = choisi ? 0 : -1
    $(b.getAttribute('aria-controls')).hidden = !choisi
    if (choisi && avecFocus) b.focus()
  }
  $('tout-fermer').hidden = nom === 'ordres'
  $('tout-annuler').hidden = nom !== 'ordres'
  placerOnglet()
  if (nom === 'compte') majCompte()
}
lesOnglets.forEach((b, i) => {
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-selected') !== 'true') tape()
    choisirOnglet(b.id.slice(2))
  })
  b.addEventListener('keydown', (e) => {
    const vers = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: lesOnglets.length - 1 }[e.key]
    if (vers === undefined) return
    e.preventDefault()
    tape()
    choisirOnglet(lesOnglets[(vers + lesOnglets.length) % lesOnglets.length].id.slice(2), true)
  })
})
function cellule(tr, etiquette, classe, texte) {
  const td = document.createElement('td')
  td.dataset.l = etiquette
  if (classe) td.className = classe
  if (texte) td.textContent = texte
  tr.append(td)
  return td
}
function nombreDans(tr, etiquette, v, options) {
  const td = cellule(tr, etiquette, 'num')
  ecrire(td, v, options)
  return td
}
// La première cellule : l'icône du sens, le code du marché, et un mot dessous.
function celluleQui(tr, etiquette, sens, code, dessous) {
  const boite = piece('span', 'qui')
  boite.append(icone(sens, 22), piece('b', '', code), piece('i', `sens-${sens}`, dessous))
  cellule(tr, etiquette).append(boite)
}
function bouton(texte, nom, action, classe) {
  const b = piece('button', `petit${classe ? ` ${classe}` : ''}`, texte)
  b.type = 'button'
  b.setAttribute('aria-label', nom)
  b.addEventListener('click', action)
  return b
}
function montrerListe(nom, lignes, compteur, combien = lignes.length) {
  $(`t-${nom}`).replaceChildren(...lignes)
  $(`tb-${nom}`).hidden = !lignes.length
  $(`v-${nom}`).hidden = Boolean(lignes.length)
  if (!compteur) return
  compteur.textContent = String(combien)
  compteur.classList.toggle('a-du-monde', combien > 0)
}
function eclairer(objet, tr) {
  if (!objet.neuf) return
  objet.neuf = false
  if (!calme()) tr.classList.add('neuf') // la ligne neuve s'allume une fois
}
const sorties = (p) => `${p.tp ? nombre(p.tp) : 'none'} / ${p.sl ? nombre(p.sl) : 'none'}`
let edition = null // la position dont on règle le TP / SL : { id, err }
const triPositions = T.tri($('th-positions'), null, () => rendrePositions())
function valeurPosition(p, cle) {
  const prix = parCode[p.code].prix
  return cle === 'code' ? p.code : cle === 'pnl' ? pnlDe(p, prix) : cle === 'taux' ? pnlDe(p, prix) / p.marge : cle === 'reste' ? resteDe(p, prix) : p[cle]
}
function rendrePositions() {
  const lignes = []
  for (const p of T.trier(compte.positions, triPositions, valeurPosition)) {
    const tr = document.createElement('tr')
    eclairer(p, tr)
    celluleQui(tr, 'Position', p.sens, p.code, `${nomSens(p.sens)} ${p.levier}×`)
    nombreDans(tr, 'Size', p.qte, { dec: 4 })
    nombreDans(tr, 'Value', p.taille)
    nombreDans(tr, 'Entry', p.entree)
    const marque = cellule(tr, 'Mark', 'num')
    nombreDans(tr, 'Liq.', p.liq)
    const reste = cellule(tr, 'To liq.', 'cellule-jauge')
    const jauge = piece('span', 'jauge')
    jauge.append(piece('span'))
    const part = piece('b')
    reste.append(jauge, part)
    nombreDans(tr, 'Margin', p.marge)
    // Le PnL est ce qu'on cherche d'abord dans une position : une pastille teintée, et un filet de couleur en tête de ligne.
    const gainCase = cellule(tr, 'PnL', 'num')
    const gainPastille = piece('span', 'pnl-pastille')
    gainCase.append(gainPastille)
    p.el = { rang: tr, marque, jauge, part, pnl: gainPastille, taux: cellule(tr, 'PnL %', 'num pnl-taux') }
    cellule(tr, 'TP / SL', `num${p.tp || p.sl ? '' : ' gris'}`, sorties(p))
    cellule(tr, '', 'act').append(
      bouton('TP / SL', `Set target and stop loss on ${p.code} ${p.sens}`, () => {
        edition = edition && edition.id === p.id ? null : { id: p.id, err: '' }
        tape()
        rendrePositions()
      }),
      bouton('Close', `Close ${p.code} ${p.sens}`, () => {
        const net = fermer(p, parCode[p.code].prix, 'Market')
        dire(`Closed ${p.code} ${p.sens}`, `${nombre(net, 2, true)} credits.`, net > 0 ? 'valide' : '')
        rafraichir()
      }),
    )
    lignes.push(tr)
    if (edition && edition.id === p.id) lignes.push(editeur(p))
  }
  montrerListe('positions', lignes, $('n-positions'), compte.positions.length)
  $('tout-fermer').disabled = !compte.positions.length
  majPositions()
  demander()
}
// La ligne qui s'ouvre sous une position pour régler son objectif et son stop.
function editeur(p) {
  const tr = piece('tr', 'editeur')
  const td = piece('td')
  td.colSpan = 12
  const rang = piece('div', 'editeur-rang')
  const saisie = (nom, valeur) => {
    const boite = piece('label', 'saisie')
    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.autocomplete = 'off'
    input.placeholder = 'none'
    input.value = valeur ? valeur.toFixed(2) : ''
    input.setAttribute('aria-label', `${nom}, in points`)
    boite.append(piece('span', '', nom), input)
    return [boite, input]
  }
  const [boiteTp, tp] = saisie('TP', p.tp)
  const [boiteSl, sl] = saisie('SL', p.sl)
  const poser = () => {
    const prix = parCode[p.code].prix
    const v = { tp: lire(tp), sl: lire(sl) }
    let pb = Number.isNaN(v.tp) || v.tp === 0 ? ['tp', 'Enter a price in points, or leave it empty.'] : Number.isNaN(v.sl) || v.sl === 0 ? ['sl', 'Enter a price in points, or leave it empty.'] : null
    pb = pb || sortiesFausses(p.sens, prix, p.liq, v.tp, v.sl)
    boiteTp.classList.toggle('est-faux', Boolean(pb && pb[0] === 'tp'))
    boiteSl.classList.toggle('est-faux', Boolean(pb && pb[0] === 'sl'))
    if (pb) {
      message.textContent = pb[1]
      return
    }
    p.tp = v.tp
    p.sl = v.sl
    edition = null
    rendrePositions()
    rendreOrdres()
    dire(`Exits set on ${p.code} ${p.sens}`, `Target ${p.tp ? nombre(p.tp) : 'none'}, stop loss ${p.sl ? nombre(p.sl) : 'none'}.`, 'valide')
  }
  for (const input of [tp, sl]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') poser()
    })
  }
  const message = piece('span', 'erreur')
  message.setAttribute('role', 'alert')
  rang.append(piece('span', 'etiq', `Exits for ${p.code} ${p.sens}, in points`), boiteTp, boiteSl, bouton('Save', 'Save target and stop loss', poser), bouton('Cancel', 'Cancel', () => {
    edition = null
    rendrePositions()
  }), message)
  td.append(rang)
  tr.append(td)
  return tr
}
function majPositions() {
  let total = 0
  let marges = 0
  for (const p of compte.positions) {
    if (!p.el) continue
    const prix = parCode[p.code].prix
    const gain = pnlDe(p, prix)
    total += gain
    marges += p.marge
    p.el.rang.classList.toggle('gagne', gain > 0.005)
    p.el.rang.classList.toggle('perd', gain < -0.005)
    const reste = resteDe(p, prix)
    ecrire(p.el.marque, prix)
    ecrire(p.el.pnl, gain, { signe: true })
    ton(p.el.pnl, gain)
    ecrire(p.el.taux, (gain / p.marge) * 100, { dec: 1, signe: true, suffixe: '%' })
    ton(p.el.taux, gain)
    ecrire(p.el.part, reste * 100, { dec: 1, suffixe: '%' })
    reglerJauge(p.el.jauge, reste)
  }
  // Le total des positions ouvertes, en tête du panneau.
  const boite = $('pnl-total')
  if (boite) {
    boite.hidden = !compte.positions.length
    ecrire($('pnl-total-val'), total, { signe: true })
    ecrire($('pnl-total-taux'), marges ? (total / marges) * 100 : 0, { dec: 1, signe: true, suffixe: '%' })
    ton(boite, total)
  }
}
function rendreOrdres() {
  const lignes = compte.ordres.map((o) => {
    const tr = document.createElement('tr')
    eclairer(o, tr)
    celluleQui(tr, 'Order', o.sens, o.code, `${nomSens(o.sens)}${o.reduire ? '' : ` ${o.levier}×`}`)
    cellule(tr, 'Type', '', NOMS_TYPE[o.type])
    nombreDans(tr, 'Trigger, pts', o.prix)
    nombreDans(tr, 'Value', o.valeur)
    nombreDans(tr, 'Margin held', o.marge)
    cellule(tr, 'Reduce only', o.reduire ? '' : 'gris', o.reduire ? 'Yes' : 'No')
    cellule(tr, 'Placed', 'gris', heure(o.t))
    cellule(tr, '', 'act').append(bouton('Cancel', `Cancel ${NOMS_TYPE[o.type].toLowerCase()} ${o.sens} on ${o.code}`, () => {
      annuler(o)
      dire(`${NOMS_TYPE[o.type]} order cancelled`, `${o.code} ${o.sens}. Its margin is available again.`)
      rafraichir()
    }))
    return tr
  })
  // Les objectifs et les stops des positions attendent ici aussi.
  for (const p of compte.positions) {
    for (const type of ['tp', 'sl']) {
      if (!p[type]) continue
      const tr = document.createElement('tr')
      const sens = p.sens === 'long' ? 'short' : 'long'
      celluleQui(tr, 'Order', sens, p.code, `Closes the ${p.sens}`)
      cellule(tr, 'Type', '', NOMS_TYPE[type])
      nombreDans(tr, 'Trigger, pts', p[type])
      nombreDans(tr, 'Value', p.taille)
      cellule(tr, 'Margin held', 'num gris', 'none')
      cellule(tr, 'Reduce only', '', 'Yes')
      cellule(tr, 'Placed', 'gris', 'with the position')
      cellule(tr, '', 'act').append(bouton('Remove', `Remove the ${NOMS_TYPE[type].toLowerCase()} of ${p.code} ${p.sens}`, () => {
        p[type] = null
        rendrePositions()
        rendreOrdres()
        tape()
      }))
      lignes.push(tr)
    }
  }
  montrerListe('ordres', lignes, $('n-ordres'))
  $('tout-annuler').disabled = !compte.ordres.length
  demander()
}
function rendrePasses() {
  montrerListe('passes', compte.passes.map((h) => {
    const tr = document.createElement('tr')
    cellule(tr, 'Time', 'gris', heure(h.t))
    celluleQui(tr, 'Order', h.sens, h.code, `${nomSens(h.sens)}${h.reduire ? ', reduce only' : ''}`)
    cellule(tr, 'Type', '', NOMS_TYPE[h.type])
    nombreDans(tr, 'Price, pts', h.prix)
    nombreDans(tr, 'Value', h.valeur)
    cellule(tr, 'Status', h.statut === 'Filled' ? 'hausse' : h.statut === 'Cancelled' ? 'gris' : 'baisse', h.statut)
    return tr
  }))
}
function rendreEchanges() {
  montrerListe('echanges', compte.echanges.map((h) => {
    const tr = document.createElement('tr')
    if (h.action === 'Liquidation') tr.classList.add('liquidee')
    cellule(tr, 'Time', 'gris', heure(h.t))
    celluleQui(tr, 'Fill', h.sens, h.code, `${h.action} ${h.sens}`)
    cellule(tr, 'Through', '', h.via)
    nombreDans(tr, 'Price, pts', h.prix)
    nombreDans(tr, 'Size', h.qte, { dec: 4 })
    nombreDans(tr, 'Value', h.valeur)
    const gain = cellule(tr, 'Realized PnL', 'num')
    if (h.pnl === null) {
      gain.textContent = 'open'
      gain.classList.add('gris')
    } else {
      ecrire(gain, h.pnl, { signe: true })
      ton(gain, h.pnl)
    }
    return tr
  }))
}
$('tout-fermer').addEventListener('click', () => {
  const combien = compte.positions.length
  let net = 0
  for (const p of [...compte.positions]) net += fermer(p, parCode[p.code].prix, 'Close all')
  dire(`Closed ${combien} position${combien > 1 ? 's' : ''}`, `${nombre(net, 2, true)} credits in all.`, net > 0 ? 'valide' : '')
  rafraichir()
})
$('tout-annuler').addEventListener('click', () => {
  const combien = compte.ordres.length
  for (const o of [...compte.ordres]) annuler(o)
  dire(`Cancelled ${combien} order${combien > 1 ? 's' : ''}`, 'Their margin is available again.')
  rafraichir()
})
// Le compte : en bref dans la colonne du ticket et la barre d'état, en entier dans l'onglet Account.
function majCompte() {
  const t = totaux()
  ecrire($('c-total'), t.total)
  ecrire($('c-libre'), compte.solde)
  ecrire($('c-pris'), t.pris)
  ecrire($('c-pnl'), t.latent, { signe: true })
  ton($('c-pnl'), t.latent)
  ecrire($('etat-total'), t.total)
  ecrire($('etat-libre'), compte.solde)
  if (ongletCourant !== 'compte') return
  ecrire($('b-total'), t.total)
  ecrire($('b-libre'), compte.solde)
  ecrire($('b-pris'), t.pris)
  ecrire($('b-latent'), t.latent, { signe: true })
  ton($('b-latent'), t.latent)
  ecrire($('b-realise'), compte.realise, { signe: true })
  ton($('b-realise'), compte.realise)
  ecrire($('b-volume'), compte.volume)
  ecrire($('b-nombre'), compte.echanges.length, { dec: 0 })
  ecrire($('b-depart'), DEMO.credits)
  const points = compte.equite.length > 1 ? compte.equite : [DEMO.credits, t.total]
  courbe($('toile-equite'), points, t.total >= DEMO.credits ? C.zest : C.down, { repere: DEMO.credits, teinteRepere: C['div-3'], epaisseur: 1.5 })
}

// ---------- Tout remettre à jour après un pas ----------
function rafraichir() {
  for (const m of MARCHES) {
    const r = I.resume(m)
    ecrire(m.elPrix, m.prix)
    ecrire(m.elVar, r.variation, { signe: true, suffixe: '%' })
    ton(m.elVar, r.variation)
    ecrire(m.elHaut, r.haut)
    ecrire(m.elBas, r.bas)
    if (m.trace.offsetWidth) courbe(m.trace, minutes(m), r.variation >= 0 ? C.zest : C.down)
  }
  const r = I.resume(marche)
  ecrire($('st-var'), r.variation, { signe: true, suffixe: '%' })
  ton($('st-var'), r.variation)
  ecrire($('st-haut'), r.haut)
  ecrire($('st-bas'), r.bas)
  ecrire($('st-ampl'), (r.haut / r.bas - 1) * 100, { suffixe: '%' })
  ecrire($('st-oi'), compte.positions.reduce((somme, p) => somme + (p.code === marche.code ? p.taille : 0), 0))
  ecrire($('st-vol'), compte.volumes[marche.code] || 0)
  majCarnet()
  majPositions()
  majCompte()
  majTicket()
  demander()
}
function battre() {
  if (I.battre(surPas)) rafraichir()
}
setInterval(battre, 250)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) battre()
})

// ---------- Wallet : le connect commun du site (../commun.js), en lecture seule. Ici, on ne fait que l'afficher. ----------
document.addEventListener('gachiz:wallet', (e) => {
  const w = e.detail
  $('compte-wallet').textContent = w ? `${w.court}, read only` : 'Wallet not connected.'
})

// ---------- Raccourcis clavier : L, S, M, 1 à 4, F. Jamais pendant une saisie ni sous un pop-up. ----------
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && centre.classList.contains('plein')) return agrandir(false)
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
  if ((e.target.closest && e.target.closest('input, textarea, select')) || document.querySelector('dialog[open]')) return
  const touche = e.key.toLowerCase()
  if (touche === 'l' || touche === 's') {
    const sens = touche === 'l' ? 'long' : 'short'
    if (ticket.sens !== sens) tape()
    reglerSens(sens)
  } else if (touche === 'm') {
    tape()
    reglerType({ marche: 'limite', limite: 'stop', stop: 'marche' }[ticket.type])
  } else if (touche === 'f') {
    tape()
    agrandir(!centre.classList.contains('plein'))
  } else if (touche >= '1' && touche <= '4') {
    const m = MARCHES[Number(touche) - 1]
    if (m !== marche) tape()
    choisirMarche(m)
  }
})

// ---------- Départ ----------
// Un lien peut préparer le ticket : trade/?market=OP-IDX&side=short
const demande = new URLSearchParams(location.search)
const voulu = parCode[(demande.get('market') || '').toUpperCase()]
if (demande.get('side') === 'short') {
  ticket.sens = 'short'
  reglerSens('short', true)
}
rangerMarches()
reglerLevier(ticket.levier)
choisirMarche(voulu || marche, true)
rendrePositions()
rendreOrdres()
rendrePasses()
rendreEchanges()
tailler()
mesurerCarnet()
const replacer = () => placeurs.forEach((p) => p())
replacer()
addEventListener('resize', () => {
  replacer()
  rafraichir()
})
if (document.fonts) {
  document.fonts.ready.then(() => {
    replacer()
    graphe.cle = ''
    demander()
  })
}
requestAnimationFrame(() => {
  document.documentElement.classList.add('pret') // les curseurs sont en place : ils peuvent glisser
  document.querySelectorAll('.apparait').forEach((el, i) => {
    el.style.transitionDelay = `${i * 50}ms`
    el.classList.add('vu')
  })
})
