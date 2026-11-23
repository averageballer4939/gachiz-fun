// Gachiz : premier écran. Trois pièces : le chargement, la coque qui se retourne, le connect wallet.
// Rien n'est simulé : aucun prix, aucun ordre. Ce qui n'existe pas encore est dit « Preview ».

const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
document.documentElement.classList.add('js')

// ---------- Apparition des blocs à leur entrée dans l'écran ----------
const aMontrer = document.querySelectorAll('.apparait')
if ('IntersectionObserver' in window && !calme) {
  const veille = new IntersectionObserver((entrees) => {
    for (const e of entrees) if (e.isIntersecting) { e.target.classList.add('vu'); veille.unobserve(e.target) }
  }, { rootMargin: '0px 0px -8% 0px' })
  aMontrer.forEach((b) => veille.observe(b))
} else aMontrer.forEach((b) => b.classList.add('vu'))

// ---------- La vitrine : les vrais écrans de l'app, en 3D. Ils se redressent quand on descend la page. ----------
const vitrine = document.getElementById('vitrine')
if (vitrine && !calme) {
  const plan = vitrine.querySelector('.vitrine-scene')
  let vue = 0
  let cote = 0
  let coteVise = 0
  let enVue = false
  const suivre = () => {
    const r = vitrine.getBoundingClientRect()
    const vueVisee = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.85 + r.height * 0.25)))
    vue += (vueVisee - vue) * 0.1
    cote += (coteVise - cote) * 0.08
    plan.style.setProperty('--vue', vue.toFixed(4))
    plan.style.setProperty('--vx', cote.toFixed(4))
    if (enVue) requestAnimationFrame(suivre)
  }
  new IntersectionObserver(([e]) => {
    const avant = enVue
    enVue = e.isIntersecting
    if (enVue && !avant) requestAnimationFrame(suivre)
  }, { rootMargin: '12% 0px' }).observe(vitrine)
  vitrine.addEventListener('pointermove', (e) => {
    const r = vitrine.getBoundingClientRect()
    coteVise = ((e.clientX - r.left) / r.width) * 2 - 1
  })
  vitrine.addEventListener('pointerleave', () => { coteVise = 0 })
}
// Les sons viennent des pièces communes du site (commun.js), chargées avant ce script.
const { son } = window.gachiz

// ---------- Le tirage du pied de page : la machine sort une capsule, qui s'ouvre sur l'un des quatre indices ----------
// Rien à gagner : c'est une façon de découvrir les quatre marchés. Les objets sont des rendus, le script les déplace.
const tirage = document.getElementById('tirage')
if (tirage) {
  const bouton = document.getElementById('tirage-bouton')
  const machine = bouton.querySelector('img')
  const etatTirage = document.getElementById('tirage-etat')
  const socles = [...tirage.querySelectorAll('.socle')]
  const BILLES = ['bille-zest', 'bille-noire', 'bille-papier']
  const TAILLE = 46
  const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms))
  let enTirage = false
  const poserTrouve = (socle) => {
    socle.classList.add('est-trouve')
    socle.querySelector('.trouve').hidden = false
  }
  const vider = () => {
    for (const s of socles) {
      s.classList.remove('est-trouve')
      s.querySelector('.trouve').hidden = true
    }
  }
  const garder = () => {
    try { sessionStorage.setItem('gz-tirage', JSON.stringify(socles.filter((s) => s.classList.contains('est-trouve')).map((s) => s.dataset.code))) } catch { /* sans stockage, le plateau repart vide */ }
  }
  const annoncerTirage = (code) => {
    const n = socles.filter((s) => s.classList.contains('est-trouve')).length
    etatTirage.textContent = n === socles.length ? 'All four indexes pulled. Pull again to start over.' : code ? `${code} pulled. ${n} of ${socles.length}.` : n ? `${n} of ${socles.length} indexes pulled.` : 'Pull a capsule. Each one holds an index.'
  }
  try {
    const deja = JSON.parse(sessionStorage.getItem('gz-tirage') || '[]')
    for (const s of socles) if (deja.includes(s.dataset.code)) poserTrouve(s)
  } catch { /* plateau vide */ }
  annoncerTirage()

  const bille = (nom) => {
    const b = document.createElement('img')
    b.className = 'bille'
    b.alt = ''
    b.src = `icons/${nom}.webp`
    tirage.append(b)
    return b
  }
  const tirer = async () => {
    if (enTirage) return
    enTirage = true
    bouton.setAttribute('aria-busy', 'true')
    let libres = socles.filter((s) => !s.classList.contains('est-trouve'))
    if (!libres.length) {
      vider()
      libres = socles
    }
    const socle = libres[Math.floor(Math.random() * libres.length)]
    son('tape')
    if (!calme) {
      // La machine secoue : deux crans de manivelle.
      machine.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg) translateY(3px)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg) translateY(2px)' }, { transform: 'rotate(0)' }],
        { duration: 640, easing: 'cubic-bezier(.3,1.2,.4,1)' }
      )
      setTimeout(() => son('tape'), 230)
      await attendre(360)
      const cadre = tirage.getBoundingClientRect()
      const m = bouton.getBoundingClientRect()
      const s = socle.getBoundingClientRect()
      const x0 = m.left - cadre.left + m.width * 0.27 - TAILLE / 2 // la trappe de la machine
      const y0 = m.top - cadre.top + m.height * 0.74 - TAILLE / 2
      const sol = m.bottom - cadre.top - TAILLE * 0.62
      const x1 = x0 - 30
      const x2 = s.left - cadre.left + s.width / 2 - TAILLE / 2
      const y2 = s.top - cadre.top + 26
      const tour = ((x2 - x1) / (Math.PI * TAILLE)) * 360
      const b = bille(BILLES[Math.floor(Math.random() * BILLES.length)])
      // Elle sort de la trappe, tombe au pied de la machine et rebondit.
      await b.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(.5) rotate(0deg)`, opacity: 0, easing: 'ease-out' },
          { transform: `translate(${x0 - 6}px, ${y0 + 6}px) scale(1) rotate(-30deg)`, opacity: 1, offset: 0.16, easing: 'cubic-bezier(.5,0,1,.6)' },
          { transform: `translate(${x1}px, ${sol}px) scale(1) rotate(-150deg)`, opacity: 1, offset: 0.6, easing: 'cubic-bezier(0,.6,.5,1)' },
          { transform: `translate(${x1 - 10}px, ${sol - 18}px) scale(1) rotate(-200deg)`, opacity: 1, offset: 0.8, easing: 'cubic-bezier(.5,0,1,.6)' },
          { transform: `translate(${x1 - 18}px, ${sol}px) scale(1) rotate(-240deg)`, opacity: 1 },
        ],
        { duration: 640, fill: 'forwards' }
      ).finished
      son('tape')
      // Elle saute jusqu'à son socle, en roulant.
      await b.animate(
        [
          { transform: `translate(${x1 - 18}px, ${sol}px) rotate(-240deg)`, easing: 'cubic-bezier(.2,.7,.5,1)' },
          { transform: `translate(${(x1 - 18 + x2) / 2}px, ${Math.min(sol, y2) - 46}px) rotate(${-240 + tour / 2}deg)`, offset: 0.5, easing: 'cubic-bezier(.5,0,.8,.3)' },
          { transform: `translate(${x2}px, ${y2}px) rotate(${-240 + tour}deg)` },
        ],
        { duration: 520 + Math.abs(x2 - x1) * 0.5, fill: 'forwards' }
      ).finished
      // Elle s'ouvre : la capsule ouverte passe, l'indice en sort et se pose.
      const ouverte = bille('capsule-ouverte')
      ouverte.animate(
        [
          { transform: `translate(${x2 - 6}px, ${y2 - 8}px) scale(.9)`, opacity: 0 },
          { transform: `translate(${x2 - 6}px, ${y2 - 10}px) scale(1.25)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${x2 - 6}px, ${y2 - 4}px) scale(1.25)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${x2 - 6}px, ${y2 + 10}px) scale(1.1)`, opacity: 0 },
        ],
        { duration: 720, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      ).finished.then(() => ouverte.remove())
      b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished.then(() => b.remove())
      await attendre(150)
      poserTrouve(socle)
      socle.querySelector('.trouve').animate(
        [{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(22px) scale(.35)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' }],
        { duration: 460, easing: 'cubic-bezier(.3,1.2,.4,1)' }
      )
    } else poserTrouve(socle)
    son('valide')
    garder()
    annoncerTirage(socle.dataset.code)
    enTirage = false
    bouton.removeAttribute('aria-busy')
  }
  bouton.addEventListener('click', tirer)
}
// ---------- La ronde des packs ----------
// Le mouvement vit ici : angle, vitesse, geste, entrée. Le dessin est fait par la scène 3D (packs3d.js : de vrais
// sachets en volume, éclairés) ; sans WebGL, les mêmes images tournent en CSS 3D.
const ronde = document.getElementById('ronde')
let lancerRonde = () => {}
let rondePrete = Promise.resolve()
if (ronde) {
  const packs = [...ronde.querySelectorAll('.pack')]
  const N = packs.length
  const PAS = (Math.PI * 2) / N
  const TENUE = 3200 // un pack reste devant ce temps-là, puis la ronde avance
  const cartel = { texte: document.querySelector('.cartel-texte'), code: document.getElementById('cartel-code'), nom: document.getElementById('cartel-nom'), ligne: document.getElementById('cartel-ligne') }
  const ordres = [...document.querySelectorAll('.ordre')] // Long et Short ouvrent la démo sur le marché de devant
  const etat = { angle: 0, vitesse: 0, entree: calme ? 1 : 0, visee: { x: 0, y: 0 }, calme }
  const enveloppe = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  let scene3d = null
  let cible = null
  let glisse = false
  let lance = calme
  let survol = false
  let visible = true
  let parcouru = 0
  let xPrec = 0
  let tPrec = 0
  let repos = 0 // jusqu'à quand le pack de devant reste en place
  let tenue = TENUE
  let dernier = performance.now()
  let courant = -1
  for (const p of packs) p.style.setProperty('--masque', `url("${p.querySelector('img').getAttribute('src')}")`)

  // Le repli sans WebGL : chaque image suit le cercle, s'assombrit et se floute en s'éloignant.
  const poserCSS = () => {
    const R = Math.min(ronde.clientWidth * 0.43, 600)
    packs.forEach((p, i) => {
      const a = enveloppe(etat.angle + i * PAS)
      const prof = (1 - Math.cos(a)) / 2
      p.style.transform = `translate(-50%, -50%) translate3d(${(Math.sin(a) * R).toFixed(1)}px, ${(-prof * 26).toFixed(1)}px, ${(Math.cos(a) * R - R).toFixed(1)}px) rotateY(${(a * 57.2958).toFixed(2)}deg)`
      p.style.zIndex = String(1000 - Math.round(prof * 1000))
      p.style.setProperty('--prof', prof.toFixed(3))
      p.style.setProperty('--cote', Math.abs(Math.sin(a)).toFixed(3))
      p.style.setProperty('--lum', `${(50 - (a / Math.PI) * 140).toFixed(1)}%`)
    })
    ronde.style.setProperty('--file', Math.min(1, Math.abs(etat.vitesse) / 3.2).toFixed(3))
  }
  const annoncer = () => {
    let proche = 0
    let ecart = 9
    for (let i = 0; i < N; i++) {
      const e = Math.abs(enveloppe(etat.angle + i * PAS))
      if (e < ecart) { ecart = e; proche = i }
    }
    if (proche === courant) return
    courant = proche
    const d = packs[proche].dataset
    cartel.code.textContent = d.code
    cartel.nom.textContent = d.nom
    cartel.ligne.textContent = d.ligne
    for (const lien of ordres) lien.href = `trade/?market=${d.code}&side=${lien.dataset.sens}`
    cartel.texte.classList.remove('change')
    void cartel.texte.offsetWidth
    cartel.texte.classList.add('change')
  }
  // Amener un pack devant. `choisi` : c'est le visiteur qui l'a demandé, la ronde le lui laisse plus longtemps.
  const versPack = (i, avecTour, choisi) => {
    cible = -i * PAS + Math.round((etat.angle + i * PAS) / (Math.PI * 2)) * Math.PI * 2
    tenue = choisi ? 7000 : TENUE
    if (calme) etat.angle = cible
    if (avecTour && scene3d && !calme) scene3d.tourner(i, cible - etat.angle)
  }
  const tour = (t) => {
    const dt = Math.min(0.05, (t - dernier) / 1000)
    dernier = t
    if (cible !== null) {
      const reste = cible - etat.angle
      etat.vitesse = reste * 5.5
      if (Math.abs(reste) < 0.002) { etat.angle = cible; cible = null; etat.vitesse = 0; repos = t + tenue }
    } else if (!glisse && lance) {
      etat.vitesse *= Math.exp(-dt * 2.4) // l'élan retombe
      if (Math.abs(etat.vitesse) < 0.4 && courant >= 0) {
        if (Math.abs(enveloppe(etat.angle + courant * PAS)) > 0.004) versPack(courant) // elle se cale sur le pack le plus proche
        else if (!calme && t > repos + (survol ? 2400 : 0)) versPack((courant + 1) % N) // puis elle avance d'un pack
      }
    }
    if (!glisse) etat.angle += etat.vitesse * dt
    if (lance && etat.entree < 1) etat.entree = Math.min(1, etat.entree + dt / 1.9)
    if (visible) {
      if (scene3d) scene3d.dessiner(etat, dt, t / 1000)
      else poserCSS()
    }
    annoncer()
    requestAnimationFrame(tour)
  }

  // Le geste : on fait tourner la ronde en la tirant ; un clic amène le pack visé devant.
  ronde.addEventListener('pointerdown', (e) => {
    glisse = true
    cible = null
    parcouru = 0
    xPrec = e.clientX
    tPrec = e.timeStamp
    ronde.classList.add('glisse')
    ronde.setPointerCapture(e.pointerId)
  })
  ronde.addEventListener('pointermove', (e) => {
    const r = ronde.getBoundingClientRect()
    etat.visee.x = ((e.clientX - r.left) / r.width) * 2 - 1
    etat.visee.y = ((e.clientY - r.top) / r.height) * 2 - 1
    if (!glisse) return
    const pas = (e.clientX - xPrec) / (r.width * 0.42)
    const dt = Math.max(1, e.timeStamp - tPrec) / 1000
    parcouru += Math.abs(e.clientX - xPrec)
    etat.angle += pas
    etat.vitesse = Math.max(-9, Math.min(9, pas / dt))
    xPrec = e.clientX
    tPrec = e.timeStamp
  })
  const lacher = (e) => {
    if (!glisse) return
    glisse = false
    ronde.classList.remove('glisse')
    if (e.type !== 'pointerup' || parcouru > 6) return
    etat.vitesse = 0
    let i = -1
    if (scene3d) i = scene3d.viser(e.clientX, e.clientY)
    else {
      const vise = document.elementFromPoint(e.clientX, e.clientY)
      i = packs.indexOf(vise && vise.closest('.pack'))
    }
    if (i >= 0) versPack(i, i === courant, true)
  }
  ronde.addEventListener('pointerup', lacher)
  ronde.addEventListener('pointercancel', lacher)
  ronde.addEventListener('pointerenter', (e) => { survol = e.pointerType === 'mouse' })
  ronde.addEventListener('pointerleave', () => { survol = false; etat.visee.x = 0; etat.visee.y = 0 })
  document.getElementById('ronde-avant').addEventListener('click', () => { son('tape'); versPack((courant - 1 + N) % N, true, true) })
  document.getElementById('ronde-apres').addEventListener('click', () => { son('tape'); versPack((courant + 1) % N, true, true) })
  // Le défilement de la page pousse la ronde : elle file quand on descend.
  let yPrec = scrollY
  if (!calme) {
    addEventListener('scroll', () => {
      if (cible === null) etat.vitesse = Math.max(-7, Math.min(7, etat.vitesse - (scrollY - yPrec) * 0.012))
      yPrec = scrollY
    }, { passive: true })
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting }).observe(ronde)

  // La scène 3D : chargée à part. Le chargement du site l'attend, six secondes au plus.
  const style = getComputedStyle(document.documentElement)
  const couleur = (nom) => style.getPropertyValue(nom).trim()
  const fiches = packs.map((p) => {
    const face = p.querySelector('img').getAttribute('src')
    return { face, dos: face.replace('.webp', '-dos.webp') }
  })
  const montage = import('./packs3d.js')
    .then((m) => m.monter(ronde, fiches, { fond: couleur('--bg'), noir: couleur('--noir'), zest: couleur('--zest'), papier: couleur('--text-1'), trait: couleur('--div-3') }))
    .then((s) => {
      if (!s) return
      scene3d = s
      ronde.parentElement.classList.add('gl')
    })
    .catch(() => {})
  rondePrete = Promise.race([montage, new Promise((ok) => setTimeout(ok, 6000))]).then(() => ronde.classList.remove('attend'))
  lancerRonde = () => {
    lance = true
    if (calme) return
    etat.entree = 0
    etat.vitesse = -4.2 // l'entrée : les packs arrivent lancés, ralentissent, puis l'un d'eux se cale devant
  }
  poserCSS()
  requestAnimationFrame(tour)
}
// ---------- Chargement : le signe se plie, une boucle entière à la première visite ; il attend les packs ----------
const chargement = document.getElementById('chargement')
if (chargement) {
  const BOUCLE = 2600
  const debut = performance.now()
  let dejaVu = false
  try { dejaVu = sessionStorage.getItem('gz-vu') === '1' } catch { /* stockage refusé : on joue la boucle */ }
  const finir = () => {
    chargement.classList.add('est-fini')
    lancerRonde()
    setTimeout(() => chargement.remove(), 320)
    try { sessionStorage.setItem('gz-vu', '1') } catch { /* sans stockage, la boucle rejouera */ }
  }
  const charge = new Promise((ok) => (document.readyState === 'complete' ? ok() : addEventListener('load', ok, { once: true })))
  const polices = document.fonts ? document.fonts.ready : Promise.resolve()
  Promise.all([charge, polices, rondePrete]).then(() => {
    if (dejaVu || calme) return finir()
    const ecoule = performance.now() - debut
    setTimeout(finir, BOUCLE - (ecoule % BOUCLE)) // on sort signe déplié, à la fin d'une boucle
  })
} else {
  rondePrete.then(lancerRonde)
}
