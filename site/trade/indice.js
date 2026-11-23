// Gachiz : l'indice simulé, partagé par l'app (trade/) et la page Markets (markets/).
// Aucune source de prix n'existe. Chaque indice est une marche aléatoire à graine fixe, calculée à partir de l'heure :
// deux pages ouvertes au même moment, ou la même page rechargée, montrent les mêmes valeurs. Tout est en points.
// Script classique : il pose window.gachizIndice.
(() => {
  'use strict'
  const FENETRE = 7200 // secondes gardées : deux heures
  const BLOC = 3600 // la marche est tirée heure par heure, chaque heure raccordée à la suivante
  const borne = (x, a, b) => Math.min(b, Math.max(a, x))

  // Les quatre indices, un par licence de cartes. « suit » dit ce que l'indice suit, en une ligne ; rien d'autre
  // n'est annoncé. « pack » nomme les images du pack (../packs/<pack>.webp, -dos.webp, mini/<pack>.webp).
  // Les noms de licence s'écrivent en texte seulement.
  const MARCHES = [
    { code: 'PKMN-IDX', nom: 'Pokémon cards', pack: 'pokemon', suit: 'An index of Pokémon trading-card sales.', base: 1240, vol: 0.0003, graine: 11 },
    { code: 'OP-IDX', nom: 'One Piece cards', pack: 'onepiece', suit: 'An index of One Piece trading-card sales.', base: 860, vol: 0.00046, graine: 23 },
    { code: 'YGO-IDX', nom: 'Yu-Gi-Oh! cards', pack: 'yugioh', suit: 'An index of Yu-Gi-Oh! trading-card sales.', base: 2150, vol: 0.00022, graine: 37 },
    { code: 'SPORTS-IDX', nom: 'Sports cards', pack: 'sports', suit: 'An index of sports trading-card sales.', base: 975, vol: 0.00036, graine: 53 },
  ]
  // La mention des marques, à poser en pied de chaque page qui nomme une licence.
  const MARQUES = 'Pokémon, One Piece and Yu-Gi-Oh! are trademarks of their owners. Gachiz is an independent project and is not affiliated with them.'
  const parCode = Object.fromEntries(MARCHES.map((m) => [m.code, m]))

  function hasard(graine) {
    let a = graine >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  // Un nombre entre 0 et 1, toujours le même pour les mêmes trois entiers.
  function grain(a, b, c) {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 0x9e3779b1)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  // Le niveau de l'indice au début de l'heure b (en log) : trois ondes lentes, d'une heure, de six heures, d'un jour.
  const ONDES = [[1, 1, 0.011], [2, 6, 0.024], [3, 24, 0.04]]
  function niveau(m, b) {
    let somme = 0
    for (const [k, duree, ampleur] of ONDES) {
      const q = Math.floor(b / duree)
      const f = b / duree - q
      const v0 = grain(m.graine, k, q) * 2 - 1
      const v1 = grain(m.graine, k, q + 1) * 2 - 1
      somme += ampleur * (v0 + (v1 - v0) * f * f * (3 - 2 * f))
    }
    return somme
  }
  // Le chemin d'une heure, seconde par seconde : une marche à graine fixe, redressée pour finir au niveau de l'heure suivante.
  function chemin(m, b) {
    if (m.blocs.has(b)) return m.blocs.get(b)
    const alea = hasard((Math.imul(m.graine, 2654435761) ^ Math.imul(b, 40503)) >>> 0)
    const pas = new Float64Array(BLOC + 1)
    let humeur = 0.5
    let x = 0
    for (let k = 1; k <= BLOC; k++) {
      const n = (alea() + alea() + alea() + alea() - 2) * 1.73 // proche d'une loi normale, écart-type 1
      humeur = borne(humeur + (alea() - 0.5) * 0.08, 0, 1) // des moments calmes, des moments nerveux
      x += m.vol * (0.55 + 1.5 * humeur * humeur) * n
      pas[k] = x
    }
    const depart = niveau(m, b)
    const reste = niveau(m, b + 1) - depart - pas[BLOC]
    for (let k = 0; k <= BLOC; k++) pas[k] += depart + reste * (k / BLOC)
    m.blocs.set(b, pas)
    if (m.blocs.size > 4) m.blocs.delete(m.blocs.keys().next().value)
    return pas
  }
  // La valeur de l'indice à la seconde t (secondes depuis 1970).
  function prixA(m, t) {
    const b = Math.floor(t / BLOC)
    return Math.round(m.base * Math.exp(chemin(m, b)[t - b * BLOC]) * 100) / 100
  }

  // Le volume simulé d'une seconde : plus l'indice bouge, plus il est gros. Une part de hasard fixe, jamais un vrai volume.
  function volumeDe(m, t, avant, apres) {
    const elan = Math.min(Math.abs(Math.log(apres / avant)) / m.vol, 4)
    return Math.round((0.4 + 3 * elan) * (0.5 + grain(m.graine, t, 91)) * 100)
  }
  let tDernier = Math.floor(Date.now() / 1000) // la seconde du dernier pas
  function remplir(m, fin) {
    m.ticks = []
    m.vols = []
    let avant = prixA(m, fin - FENETRE)
    for (let t = fin - FENETRE + 1; t <= fin; t++) {
      const p = prixA(m, t)
      m.ticks.push(p)
      m.vols.push(volumeDe(m, t, avant, p))
      avant = p
    }
    m.prix = avant
  }
  for (const m of MARCHES) {
    m.blocs = new Map()
    remplir(m, tDernier)
  }

  // Avance jusqu'à l'heure courante, un pas par seconde. surPas est appelé après chaque pas. Rend le nombre de pas.
  function battre(surPas) {
    let dus = Math.floor(Date.now() / 1000) - tDernier
    if (dus <= 0) return 0
    if (dus > 900) {
      // L'onglet a dormi longtemps : la fenêtre est refaite, et seul le dernier quart d'heure est rejoué pas à pas.
      tDernier += dus - 900
      for (const m of MARCHES) remplir(m, tDernier)
      dus = 900
    }
    for (let n = 0; n < dus; n++) {
      tDernier += 1
      for (const m of MARCHES) {
        const avant = m.prix
        m.prix = prixA(m, tDernier)
        m.ticks.push(m.prix)
        m.vols.push(volumeDe(m, tDernier, avant, m.prix))
        if (m.ticks.length > FENETRE) {
          m.ticks.shift()
          m.vols.shift()
        }
      }
      if (surPas) surPas()
    }
    return dus
  }
  // Les bougies : `taille` secondes chacune, les `max` dernières.
  function bougies(m, taille, max) {
    const n = m.ticks.length
    const liste = []
    let b = null
    for (let k = Math.max(0, n - (max + 1) * taille); k < n; k++) {
      const seau = Math.floor((tDernier - (n - 1 - k)) / taille)
      const p = m.ticks[k]
      if (!b || b.seau !== seau) {
        const o = b ? b.c : p
        b = { seau, t: seau * taille * 1000, o, h: Math.max(o, p), l: Math.min(o, p), c: p, v: m.vols[k] }
        liste.push(b)
      } else {
        if (p > b.h) b.h = p
        if (p < b.l) b.l = p
        b.c = p
        b.v += m.vols[k]
      }
    }
    return liste.slice(-max)
  }
  // Le résumé des deux heures : variation en %, plus haut, plus bas.
  function resume(m) {
    let haut = -Infinity
    let bas = Infinity
    for (const p of m.ticks) {
      if (p > haut) haut = p
      if (p < bas) bas = p
    }
    return { prix: m.prix, variation: (m.prix / m.ticks[0] - 1) * 100, haut, bas }
  }

  window.gachizIndice = { FENETRE, MARCHES, MARQUES, parCode, grain, battre, bougies, resume, get tDernier() { return tDernier * 1000 } }
})()
