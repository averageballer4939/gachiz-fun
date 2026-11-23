// Gachiz : les pièces du terminal partagées par l'app (trade/) et la page Markets (markets/) : la barre d'état,
// les réglages de la démo (animations, densité, remise à zéro), les marchés épinglés, le tri des tableaux.
// Script classique : il pose window.gachizTerminal. Rien ici ne touche à un wallet ni au réseau.
(() => {
  'use strict'
  const racine = document.documentElement
  const $ = (id) => document.getElementById(id)
  const lireStock = (cle, defaut) => {
    try { return JSON.parse(localStorage.getItem(cle)) ?? defaut } catch { return defaut }
  }
  const ecrireStock = (cle, valeur) => {
    try { localStorage.setItem(cle, JSON.stringify(valeur)) } catch { /* sans stockage, le choix tient jusqu'au rechargement */ }
  }
  const tape = () => window.gachiz && window.gachiz.son('tape')

  // ---------- Réglages : animations et densité ----------
  const systemeCalme = matchMedia('(prefers-reduced-motion: reduce)').matches
  const reglages = { animations: true, densite: 'compact', ...lireStock('gz-reglages', {}) }
  function appliquer() {
    racine.classList.toggle('sans-anim', !reglages.animations)
    racine.classList.toggle('aere', reglages.densite === 'aere')
    for (const b of document.querySelectorAll('[data-reglage="animations"]')) b.setAttribute('aria-pressed', String(reglages.animations))
    for (const b of document.querySelectorAll('[data-densite]')) b.setAttribute('aria-pressed', String(b.dataset.densite === reglages.densite))
    dispatchEvent(new Event('resize')) // les curseurs et les toiles se replacent
  }
  const calme = () => systemeCalme || !reglages.animations

  // ---------- Le panneau des réglages et la barre d'état ----------
  const panneau = $('reglages')
  const bouton = $('reglages-bouton')
  function fermer() {
    if (!panneau || panneau.hidden) return
    panneau.hidden = true
    bouton.setAttribute('aria-expanded', 'false')
  }
  if (panneau && bouton) {
    bouton.addEventListener('click', () => {
      tape()
      panneau.hidden = !panneau.hidden
      bouton.setAttribute('aria-expanded', String(!panneau.hidden))
    })
    addEventListener('click', (e) => {
      if (!panneau.hidden && !e.target.closest('#reglages, #reglages-bouton')) fermer()
    })
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fermer()
    })
    for (const b of panneau.querySelectorAll('[data-reglage="animations"]')) {
      b.addEventListener('click', () => {
        reglages.animations = !reglages.animations
        ecrireStock('gz-reglages', reglages)
        appliquer()
        tape()
      })
    }
    for (const b of panneau.querySelectorAll('[data-densite]')) {
      b.addEventListener('click', () => {
        reglages.densite = b.dataset.densite
        ecrireStock('gz-reglages', reglages)
        appliquer()
        tape()
      })
    }
    // La remise à zéro demande deux clics : le premier arme le bouton pendant trois secondes.
    const remise = $('remise')
    if (remise) {
      let arme = 0
      remise.addEventListener('click', () => {
        if (!arme) {
          remise.textContent = 'Click again to reset'
          remise.classList.add('petit-alerte')
          arme = setTimeout(() => {
            arme = 0
            remise.textContent = 'Reset demo account'
          }, 3000)
          return
        }
        clearTimeout(arme)
        arme = 0
        remise.textContent = 'Reset demo account'
        fermer()
        document.dispatchEvent(new Event('gachiz:remise'))
      })
    }
  }
  const horloge = $('etat-heure')
  if (horloge) {
    const deux = (n) => String(n).padStart(2, '0')
    const battre = () => {
      const d = new Date()
      horloge.textContent = `${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`
    }
    battre()
    setInterval(battre, 500)
  }
  const etatWallet = $('etat-wallet')
  if (etatWallet) {
    document.addEventListener('gachiz:wallet', (e) => {
      const w = e.detail
      etatWallet.textContent = w ? `${w.court} · ${w.reseau}` : 'not connected'
    })
  }

  // ---------- Marchés épinglés : gardés d'une page à l'autre ----------
  const epingles = new Set(lireStock('gz-epingles', []))
  function basculerEpingle(code) {
    if (epingles.has(code)) epingles.delete(code)
    else epingles.add(code)
    ecrireStock('gz-epingles', [...epingles])
    tape()
  }

  // ---------- Tri d'un tableau : un clic sur une colonne, un second pour inverser ----------
  // tete : le <thead> dont les <th data-tri="cle"> portent un bouton .tri ; rend { cle, sens } et appelle surTri.
  function tri(tete, defaut, surTri) {
    const etat = { cle: defaut ? defaut.cle : null, sens: defaut ? defaut.sens : -1 }
    const montrer = () => {
      for (const th of tete.querySelectorAll('th[data-tri]')) {
        if (th.dataset.tri === etat.cle) th.setAttribute('aria-sort', etat.sens > 0 ? 'ascending' : 'descending')
        else th.removeAttribute('aria-sort')
      }
    }
    for (const th of tete.querySelectorAll('th[data-tri]')) {
      const texte = th.textContent
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tri'
      b.textContent = texte
      th.replaceChildren(b)
      b.addEventListener('click', () => {
        if (etat.cle === th.dataset.tri) etat.sens = -etat.sens
        else {
          etat.cle = th.dataset.tri
          etat.sens = th.dataset.sens === 'haut' ? 1 : -1
        }
        montrer()
        tape()
        surTri()
      })
    }
    montrer()
    return etat
  }
  const trier = (liste, etat, valeur) => (etat.cle ? [...liste].sort((a, b) => {
    const x = valeur(a, etat.cle)
    const y = valeur(b, etat.cle)
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * etat.sens
  }) : liste)

  appliquer()
  window.gachizTerminal = { calme, epingles, basculerEpingle, tri, trier, tape }
})()
