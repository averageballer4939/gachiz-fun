// Gachiz : la page Markets. Le tableau des quatre indices et leurs fiches, avec leur valeur de démo en direct.
// Les valeurs viennent de la même simulation que l'app (../trade/indice.js, à graine fixe, calculée sur l'heure) :
// les deux pages montrent donc les mêmes nombres au même moment. Rien n'est un vrai prix.
'use strict'
document.documentElement.classList.add('js')
const I = window.gachizIndice
const T = window.gachizTerminal
const { ecrire, ton, courbe, minutes } = window.gachizChiffres
const styleRacine = getComputedStyle(document.documentElement)
const couleur = (nom) => styleRacine.getPropertyValue(`--${nom}`).trim()
const C = { zest: couleur('zest'), down: couleur('down'), repere: couleur('div-3') }

// ---------- Les lignes du tableau et les fiches, construites depuis la liste des marchés (../trade/indice.js) ----------
function piece(balise, classe, texte) {
  const el = document.createElement(balise)
  if (classe) el.className = classe
  if (texte) el.textContent = texte
  return el
}
function image(src, classe, hauteur) {
  const img = document.createElement('img')
  img.src = src
  img.alt = ''
  img.decoding = 'async'
  if (classe) img.className = classe
  if (hauteur) img.style.height = `${hauteur}px`
  return img
}
const lien = (m, sens, avecIcone) => {
  const a = piece('a', `petit petit-${sens}${avecIcone ? ' geste' : ''}`)
  a.href = `../trade/?market=${encodeURIComponent(m.code)}&side=${sens}`
  a.dataset.sens = sens
  if (avecIcone) a.append(image(`../icons/${sens}.webp`))
  a.append(sens === 'long' ? 'Long' : 'Short')
  a.setAttribute('aria-label', `${sens === 'long' ? 'Long' : 'Short'} ${m.code} in the trading demo`)
  return a
}
const td = (tr, etiquette, classe, attribut) => {
  const c = piece('td', classe)
  if (etiquette) c.dataset.l = etiquette
  if (attribut) c.setAttribute(attribut, '')
  tr.append(c)
  return c
}
for (const m of I.MARCHES) {
  const tr = piece('tr')
  tr.dataset.code = m.code
  const ep = piece('button', 'epingle')
  ep.type = 'button'
  ep.setAttribute('aria-label', `Pin ${m.code}`)
  td(tr, '', 'col-ep').append(ep)
  const qui = piece('span', 'qui')
  qui.append(image(`../packs/mini/${m.pack}.webp`, 'vignette'), piece('b', '', m.code), piece('i', '', m.nom))
  td(tr, 'Index').append(qui)
  td(tr, 'Demo value, pts', 'num fort', 'data-prix')
  td(tr, '2h change', 'num', 'data-var')
  td(tr, '2h high', 'num', 'data-haut')
  td(tr, '2h low', 'num', 'data-bas')
  td(tr, '2h range', 'num', 'data-ampl')
  td(tr, 'Last tick', 'num', 'data-pas')
  const toile = piece('canvas')
  toile.width = 120
  toile.height = 20
  toile.setAttribute('aria-hidden', 'true')
  td(tr, '2h curve', 'cellule-courbe').append(toile)
  td(tr, 'Composition', 'attente').textContent = 'Not announced yet'
  td(tr, 'Funding', 'attente').textContent = 'Not announced yet'
  td(tr, '', 'act').append(lien(m, 'long'), lien(m, 'short'))
  document.getElementById('tableau-corps').append(tr)

  const f = piece('article', 'famille cadre-t apparait')
  f.dataset.code = m.code
  const boite = piece('div', 'famille-pack')
  boite.dataset.pack = m.pack
  boite.append(image(`../packs/${m.pack}.webp`))
  const tete = piece('div', 'famille-tete')
  tete.append(piece('p', 'etiq', m.code), piece('h2', '', m.nom))
  const valeur = piece('div', 'famille-valeur')
  const grand = piece('p', 'grand')
  grand.setAttribute('data-prix', '')
  const moyen = piece('p', 'moyen')
  moyen.setAttribute('data-var', '')
  valeur.append(grand, moyen, piece('span', 'etiq', 'pts · 2h'))
  const courbeFiche = piece('canvas', 'famille-courbe')
  courbeFiche.width = 280
  courbeFiche.height = 40
  courbeFiche.setAttribute('role', 'img')
  courbeFiche.setAttribute('aria-label', `${m.code}, simulated over two hours`)
  const faits = piece('dl', 'famille-faits')
  for (const [nom, attribut] of [['2h high', 'data-haut'], ['2h low', 'data-bas'], ['Composition', null]]) {
    const div = piece('div')
    const dd = piece('dd', attribut ? '' : 'attente', attribut ? '' : 'Not announced yet')
    if (attribut) dd.setAttribute(attribut, '')
    div.append(piece('dt', '', nom), dd)
    faits.append(div)
  }
  const gestes = piece('div', 'famille-gestes')
  gestes.append(lien(m, 'long', true), lien(m, 'short', true))
  f.append(boite, tete, piece('p', 'famille-suit', m.suit), valeur, courbeFiche, faits, gestes)
  document.getElementById('familles').append(f)
}

// ---------- Les lignes du tableau et les fiches : mêmes valeurs, mêmes cases ----------
const cases = (el) => ({
  prix: el.querySelector('[data-prix]'), variation: el.querySelector('[data-var]'), haut: el.querySelector('[data-haut]'), bas: el.querySelector('[data-bas]'),
  ampleur: el.querySelector('[data-ampl]'), pas: el.querySelector('[data-pas]'), toile: el.querySelector('canvas'),
})
const familles = [...document.querySelectorAll('.famille')].map((el) => ({ m: I.parCode[el.dataset.code], el, boite: el.querySelector('.famille-pack'), pack: null, monte: false, ...cases(el) }))
const lignes = [...document.querySelectorAll('#tableau-corps tr')].map((el) => ({ m: I.parCode[el.dataset.code], el, epingle: el.querySelector('.epingle'), ...cases(el) }))
function rafraichir() {
  for (const f of [...lignes, ...familles]) {
    const m = f.m
    const r = I.resume(m)
    ecrire(f.prix, r.prix)
    ecrire(f.variation, r.variation, { signe: true, suffixe: '%' })
    ton(f.variation, r.variation)
    ecrire(f.haut, r.haut)
    ecrire(f.bas, r.bas)
    if (f.ampleur) ecrire(f.ampleur, (r.haut / r.bas - 1) * 100, { suffixe: '%' })
    if (f.pas) {
      const pas = m.prix - m.ticks[m.ticks.length - 2]
      ecrire(f.pas, pas, { signe: true })
      ton(f.pas, pas)
    }
    // La courbe des deux heures ; sur les fiches, le pointillé marque la valeur du départ.
    if (f.toile && f.toile.offsetWidth) courbe(f.toile, minutes(m), r.variation >= 0 ? C.zest : C.down, f.boite ? { repere: m.ticks[0], teinteRepere: C.repere, epaisseur: 1.5 } : {})
  }
}

// ---------- Recherche, tri par colonne, épingles (gardées d'une page à l'autre) ----------
const corps = document.getElementById('tableau-corps')
const cherche = document.getElementById('cherche')
const tri = T.tri(document.getElementById('tableau-tete'), null, () => ranger())
function valeur(l, cle) {
  const r = I.resume(l.m)
  return cle === 'code' ? l.m.code : cle === 'prix' ? r.prix : cle === 'variation' ? r.variation : cle === 'haut' ? r.haut : cle === 'bas' ? r.bas : r.haut / r.bas
}
function ranger() {
  const mot = cherche.value.trim().toLowerCase()
  const liste = T.trier(lignes, tri, valeur).filter((l) => !mot || l.m.code.toLowerCase().includes(mot) || l.m.nom.toLowerCase().includes(mot))
  liste.sort((a, b) => Number(T.epingles.has(b.m.code)) - Number(T.epingles.has(a.m.code))) // les épinglés d'abord
  corps.replaceChildren(...liste.map((l) => l.el))
  document.getElementById('tableau-vide').hidden = liste.length > 0
  for (const f of familles) f.el.hidden = Boolean(mot) && !liste.some((l) => l.m === f.m)
  rafraichir()
}
cherche.addEventListener('input', ranger)
for (const l of lignes) {
  l.epingle.setAttribute('aria-pressed', String(T.epingles.has(l.m.code)))
  l.epingle.addEventListener('click', () => {
    T.basculerEpingle(l.m.code)
    l.epingle.setAttribute('aria-pressed', String(T.epingles.has(l.m.code)))
    ranger()
  })
}
ranger()
setInterval(() => {
  if (I.battre()) rafraichir()
}, 250)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && I.battre()) rafraichir()
})
addEventListener('resize', rafraichir)

// ---------- Le pack de chaque famille en vraie 3D (../packs3d.js), monté quand sa fiche arrive à l'écran ----------
// Sans WebGL, l'image du pack reste en place.
const couleursPack = { fond: couleur('bg'), noir: couleur('noir'), zest: C.zest, papier: couleur('text-1'), trait: C.repere }
function monterPack(f) {
  if (f.monte) return
  f.monte = true
  const nom = f.boite.dataset.pack
  import('../packs3d.js')
    .then((mod) => (typeof mod.monterUn === 'function' ? mod.monterUn(f.boite, { face: `../packs/${nom}.webp`, dos: `../packs/${nom}-dos.webp` }, couleursPack) : null))
    .then((pack) => {
      if (!pack) return
      f.pack = pack
      f.boite.classList.add('gl')
    })
    .catch(() => {})
}
for (const f of familles) {
  // Le pack fait un tour quand on vise Long ou Short.
  for (const geste of f.el.querySelectorAll('.geste')) {
    const tourner = () => {
      if (f.pack && !T.calme()) f.pack.tourner(geste.dataset.sens === 'long' ? 1 : -1)
    }
    geste.addEventListener('pointerenter', tourner)
    geste.addEventListener('focus', tourner)
  }
}

// ---------- Apparition des blocs à leur entrée dans l'écran ; les packs se montent au même moment ----------
const parFiche = new Map(familles.map((f) => [f.el, f]))
if ('IntersectionObserver' in window) {
  const vus = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue
      e.target.classList.add('vu')
      if (parFiche.has(e.target)) monterPack(parFiche.get(e.target))
      vus.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -4% 0px' })
  document.querySelectorAll('.apparait').forEach((el) => vus.observe(el))
} else {
  document.querySelectorAll('.apparait').forEach((el) => el.classList.add('vu'))
  familles.forEach(monterPack)
}
