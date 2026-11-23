// La ronde des packs en vraie 3D. three.js est servi depuis le site (vendor/, licence MIT).
// Chaque pack est un sachet en volume : deux faces bombées qui se rejoignent aux soudures, sa face et son dos en
// texture, une lumière de studio qui glisse sur l'aluminium quand il tourne.
// Le mouvement (angle, vitesse, entrée, visée) est tenu par app.js ; ici on ne fait que dessiner.
import * as THREE from './vendor/three.module.js'

const TOUR = Math.PI * 2
const CHAMP = 30 // angle de la caméra, en degrés
const RECUL = 4.8 // distance de la caméra au pack de devant
const FOND = 2.2 // demi-profondeur de la ronde
const borne = (x, a, b) => Math.min(b, Math.max(a, x))
const lisse = (x) => { x = borne(x, 0, 1); return x * x * (3 - 2 * x) }
const enveloppe = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// Le sachet : largeur 1, hauteur `ratio`. Plat aux soudures du haut et du bas, bombé au milieu, froncé près des soudures.
export function sachet(ratio) {
  const NX = 40
  const NY = 68
  const SOUDURE = 0.07
  const EPAISSEUR = 0.058
  const points = []
  const uv = []
  const index = []
  const forme = new THREE.BufferGeometry()
  ;[1, -1].forEach((sens, groupe) => {
    const base = points.length / 3
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX
        const v = j / NY
        const bord = Math.min(v, 1 - v)
        const large = Math.pow(1 - Math.pow(Math.abs(2 * u - 1), 2.4), 0.6)
        const haut = lisse((bord - SOUDURE) / 0.17)
        const fronce = (1 - lisse((bord - SOUDURE) / 0.24)) * haut
        const z = 0.003 + EPAISSEUR * large * haut * (0.86 + 0.14 * Math.sin(v * Math.PI)) + 0.007 * fronce * large * Math.sin(u * 52 + Math.sin(v * 11 + groupe) * 2.2)
        points.push(u - 0.5, (v - 0.5) * ratio, sens * z)
        uv.push(sens === 1 ? u : 1 - u, v)
      }
    }
    const debut = index.length
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = base + j * (NX + 1) + i
        const b = a + 1
        const c = a + NX + 1
        const d = c + 1
        if (sens === 1) index.push(a, b, d, a, d, c)
        else index.push(a, d, b, a, c, d)
      }
    }
    forme.addGroup(debut, index.length - debut, groupe)
  })
  forme.setIndex(index)
  forme.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  forme.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  forme.computeVertexNormals()
  return forme
}

// Le studio : des panneaux de lumière autour de la scène, dont les packs prennent les reflets.
export function studio(rendu, c) {
  const piece = new THREE.Scene()
  piece.background = new THREE.Color(c.noir)
  const panneau = (teinte, force, l, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(teinte).multiplyScalar(force), side: THREE.DoubleSide, toneMapped: false }))
    m.position.set(x, y, z)
    m.lookAt(0, 0, 0)
    piece.add(m)
  }
  panneau(c.papier, 9, 7, 1.6, 0, 7, 3)
  panneau(c.papier, 5, 1.3, 9, -7, 1, 4)
  panneau(c.papier, 3.5, 1.1, 9, 7, 0, 2)
  panneau(c.papier, 1.1, 14, 10, 0, 1, 9)
  panneau(c.zest, 3, 5, 5, 4, -3, -7)
  const outil = new THREE.PMREMGenerator(rendu)
  const carte = outil.fromScene(piece, 0.035).texture
  outil.dispose()
  return carte
}

// Le fond de la scène : la couleur du site et, au centre, une lueur ronde dans la couleur d'accent.
function fondDe(c) {
  const t = document.createElement('canvas')
  t.width = 512
  t.height = 256
  const g = t.getContext('2d')
  g.fillStyle = c.fond
  g.fillRect(0, 0, 512, 256)
  const [r, v, b] = [1, 3, 5].map((k) => parseInt(c.zest.slice(k, k + 2), 16))
  g.translate(256, 116)
  g.scale(1.7, 1)
  const d = g.createRadialGradient(0, 0, 0, 0, 0, 128)
  d.addColorStop(0, `rgba(${r}, ${v}, ${b}, .2)`)
  d.addColorStop(0.5, `rgba(${r}, ${v}, ${b}, .06)`)
  d.addColorStop(1, `rgba(${r}, ${v}, ${b}, 0)`)
  g.fillStyle = d
  g.fillRect(-256, -128, 512, 256)
  const carte = new THREE.CanvasTexture(t)
  carte.colorSpace = THREE.SRGBColorSpace
  return carte
}
export async function monter(ronde, fiches, c) {
  const toile = document.createElement('canvas')
  toile.className = 'toile'
  toile.setAttribute('aria-hidden', 'true')
  let rendu
  try {
    rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  const fond = new THREE.Color(c.fond)
  rendu.toneMapping = THREE.NeutralToneMapping
  rendu.autoClear = false
  rendu.setClearColor(fond, 1)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(fond, RECUL + 1.8, RECUL + FOND * 2 + 2.6)
  scene.environment = studio(rendu, c)
  const cle = new THREE.DirectionalLight(new THREE.Color(c.papier), 1.2)
  cle.position.set(-3, 5, 7)
  const contre = new THREE.DirectionalLight(new THREE.Color(c.zest), 1.2)
  contre.position.set(4, 2.5, -6)
  scene.add(cle, contre)
  const camera = new THREE.PerspectiveCamera(CHAMP, 1, 0.1, 60)
  camera.position.set(0, 0.7, FOND + RECUL)
  camera.lookAt(0, 0.03, FOND)

  // Textures et matières : une par image, partagée entre les packs qui la portent.
  const chargeur = new THREE.TextureLoader()
  const finesse = rendu.capabilities.getMaxAnisotropy()
  const matieres = new Map()
  const matiere = (url) => {
    if (!matieres.has(url)) {
      matieres.set(url, chargeur.loadAsync(url).then((carte) => {
        carte.colorSpace = THREE.SRGBColorSpace
        carte.anisotropy = finesse
        return new THREE.MeshPhysicalMaterial({ map: carte, alphaTest: 0.5, alphaToCoverage: true, metalness: 0.15, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.18 })
      }))
    }
    return matieres.get(url)
  }
  const formes = new Map()
  const packs = []
  try {
    for (const [i, fiche] of fiches.entries()) {
      const [face, dos] = await Promise.all([matiere(fiche.face), matiere(fiche.dos)])
      const ratio = Math.round((face.map.image.height / face.map.image.width) * 100) / 100
      if (!formes.has(ratio)) formes.set(ratio, sachet(ratio))
      const pack = new THREE.Mesh(formes.get(ratio), [face, dos])
      pack.rotation.order = 'YXZ'
      pack.userData.i = i
      scene.add(pack)
      packs.push(pack)
    }
  } catch {
    rendu.dispose()
    return null
  }

  // Les orbites au sol.
  const cercle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.sin((k / 128) * TOUR), 0, Math.cos((k / 128) * TOUR))))
  const trait = new THREE.LineBasicMaterial({ color: new THREE.Color(c.trait), toneMapped: false })
  const orbites = [1, 1.24].map((k) => {
    const o = new THREE.Line(cercle, trait)
    o.userData.k = k
    o.position.y = -1
    scene.add(o)
    return o
  })

  // Le voile : le fond de la scène, posé sur l'image d'avant. Moins il est opaque, plus les packs laissent une traînée.
  const voile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: fondDe(c), transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }))
  const sceneVoile = new THREE.Scene()
  sceneVoile.add(voile)
  const cameraVoile = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)

  let largeur = 4 // demi-largeur de la ronde, selon la forme de la toile
  let net = true
  const ajuster = () => {
    const l = ronde.clientWidth
    const h = ronde.clientHeight
    if (!l || !h) return
    rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    rendu.setSize(l, h, false)
    camera.aspect = l / h
    camera.updateProjectionMatrix()
    largeur = borne(Math.tan((CHAMP * Math.PI) / 360) * RECUL * camera.aspect * 1.42, 1.5, 5.4)
    for (const o of orbites) o.scale.set(largeur * o.userData.k, 1, FOND * o.userData.k)
    net = true
  }
  new ResizeObserver(ajuster).observe(ronde)
  ajuster()

  const pas = TOUR / packs.length
  const POSES = matchMedia('(pointer: coarse)').matches ? 8 : 18 // poses dessinées au plus entre deux images
  const DUREE_TOUR = 0.9 // secondes, pour un tour d'un pack sur lui-même
  const tours = new Float32Array(packs.length) // tour sur lui-même qu'il reste à faire à chaque pack
  const toursPrec = new Float32Array(packs.length)
  const departs = new Float32Array(packs.length).fill(-9)
  const sens = new Float32Array(packs.length)
  const visee = { x: 0, y: 0 }
  let horloge = 0
  // Pose chaque pack pour un angle de la ronde ; `part` : où l'on est entre l'image d'avant (0) et celle-ci (1).
  const placer = (angle, part, etat, t, penche) => {
    packs.forEach((pack, i) => {
      const a = enveloppe(angle + i * pas)
      const devant = Math.pow(Math.max(0, Math.cos(a)), 10)
      const e = 1 - Math.pow(1 - borne(etat.entree * 1.5 - (Math.abs(a) / Math.PI) * 0.5, 0, 1), 3) // les plus proches arrivent d'abord
      pack.position.set(
        largeur * Math.sin(a) * (1 + (1 - e) * 0.5),
        Math.sin(t * 0.9 + i * 1.3) * 0.045 + devant * 0.03 - (1 - e) * 1.4,
        FOND * Math.cos(a) + devant * 0.4 - (1 - e) * 7
      )
      pack.rotation.set(
        -visee.y * 0.22 * devant + Math.sin(t * 0.7 + i) * 0.03,
        a - 0.25 * Math.sin(2 * a) + visee.x * 0.5 * devant + Math.sin(t * 0.6 + i * 2.1) * 0.07 * (1 - devant * 0.4) + toursPrec[i] + (tours[i] - toursPrec[i]) * part + (1 - e) * 5,
        Math.sin(t * 0.5 + i * 1.7) * 0.03 + penche
      )
      pack.scale.setScalar((1 + devant * 0.12) * (0.55 + 0.45 * e))
    })
  }
  let anglePrec = null
  const dessiner = (etat, dt, t) => {
    horloge = t
    visee.x += (etat.visee.x - visee.x) * Math.min(1, dt * 6)
    visee.y += (etat.visee.y - visee.y) * Math.min(1, dt * 6)
    let elan = Math.abs(etat.vitesse)
    let ecartTour = 0
    for (let i = 0; i < tours.length; i++) {
      const p = borne((t - departs[i]) / DUREE_TOUR, 0, 1)
      const doux = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      toursPrec[i] = tours[i]
      tours[i] = sens[i] * TOUR * (1 - doux)
      ecartTour = Math.max(ecartTour, Math.abs(tours[i] - toursPrec[i]))
    }
    elan = Math.max(elan, (ecartTour / Math.max(dt, 0.001)) * 0.35)
    const penche = borne(etat.vitesse * 0.04, -0.22, 0.22)
    // Le flou de mouvement : plus la ronde file, plus l'image d'avant reste. Un geste rapide est dessiné en poses
    // serrées entre deux images (moins de deux pixels d'écart), pour une traînée continue et non des copies.
    const traine = etat.calme ? 0 : lisse((elan - 0.7) / 5) * 0.8
    if (net) {
      rendu.clear()
      net = false
      anglePrec = null
    }
    const depart = anglePrec === null ? etat.angle : anglePrec
    const trajet = Math.abs(etat.angle - depart) * toile.clientWidth * 0.42 + ecartTour * toile.clientHeight * 0.18 // en pixels
    const poses = traine > 0.02 ? borne(Math.ceil(trajet / 1.6), 1, POSES) : 1
    const garde = traine > 0 ? Math.pow(traine, 1 / poses) : 0
    voile.material.opacity = 1 - garde
    for (let k = 1; k <= poses; k++) {
      placer(depart + (etat.angle - depart) * (k / poses), k / poses, etat, t, penche)
      rendu.clearDepth()
      rendu.render(sceneVoile, cameraVoile)
      rendu.clearDepth()
      rendu.render(scene, camera)
    }
    anglePrec = etat.angle
  }
  const rayon = new THREE.Raycaster()
  const point = new THREE.Vector2()
  const viser = (x, y) => {
    const r = toile.getBoundingClientRect()
    point.set(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2)
    rayon.setFromCamera(point, camera)
    const touche = rayon.intersectObjects(packs, false)[0]
    return touche ? touche.object.userData.i : -1
  }
  const tourner = (i, cote) => {
    departs[i] = horloge
    sens[i] = cote < 0 ? -1 : 1
  }

  ronde.prepend(toile)
  return { dessiner, viser, tourner }
}

// Un seul pack en vraie 3D, pour l'app et la page des marchés : il remplit sa boîte sur une toile transparente,
// flotte, suit le curseur, fait un tour sur demande (tourner) et change de sachet (changer).
// Rend null sans WebGL : la page garde alors l'image du pack.
export async function monterUn(boite, fiche, c) {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
  const toile = document.createElement('canvas')
  toile.className = 'toile'
  toile.setAttribute('aria-hidden', 'true')
  let rendu
  try {
    rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, alpha: true })
  } catch {
    return null
  }
  rendu.toneMapping = THREE.NeutralToneMapping
  rendu.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.environment = studio(rendu, c)
  const cle = new THREE.DirectionalLight(new THREE.Color(c.papier), 1.2)
  cle.position.set(-3, 5, 7)
  const contre = new THREE.DirectionalLight(new THREE.Color(c.zest), 1.2)
  contre.position.set(4, 2.5, -6)
  scene.add(cle, contre)
  const camera = new THREE.PerspectiveCamera(CHAMP, 1, 0.1, 40)

  const chargeur = new THREE.TextureLoader()
  const finesse = rendu.capabilities.getMaxAnisotropy()
  const matiere = async (url) => {
    const carte = await chargeur.loadAsync(url)
    carte.colorSpace = THREE.SRGBColorSpace
    carte.anisotropy = finesse
    return new THREE.MeshPhysicalMaterial({ map: carte, alphaTest: 0.5, alphaToCoverage: true, metalness: 0.15, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.18 })
  }
  let pack = null
  let ratio = 1.7
  const cadrer = () => {
    const l = boite.clientWidth
    const h = boite.clientHeight
    if (!l || !h) return
    rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    rendu.setSize(l, h, false)
    camera.aspect = l / h
    // Le pack entier dans la boîte, même quand il tourne : on recule jusqu'à ce que sa hauteur et sa largeur tiennent.
    const demi = Math.tan((CHAMP * Math.PI) / 360)
    camera.position.set(0, 0, Math.max(ratio / 0.84 / (2 * demi), 1.16 / 0.9 / (2 * demi * camera.aspect)))
    camera.updateProjectionMatrix()
  }
  const poser = async (f) => {
    const [face, dos] = await Promise.all([matiere(f.face), matiere(f.dos)])
    if (pack) {
      scene.remove(pack)
      pack.geometry.dispose()
      for (const m of pack.material) {
        m.map.dispose()
        m.dispose()
      }
    }
    ratio = face.map.image.height / face.map.image.width
    pack = new THREE.Mesh(sachet(ratio), [face, dos])
    pack.rotation.order = 'YXZ'
    scene.add(pack)
    cadrer()
  }
  try {
    await poser(fiche)
  } catch {
    rendu.dispose()
    return null
  }
  new ResizeObserver(cadrer).observe(boite)

  const visee = { x: 0, y: 0, vx: 0, vy: 0 }
  let depart = -9
  let cote = 1
  let visible = true
  boite.addEventListener('pointermove', (e) => {
    const r = boite.getBoundingClientRect()
    visee.vx = ((e.clientX - r.left) / r.width) * 2 - 1
    visee.vy = ((e.clientY - r.top) / r.height) * 2 - 1
  })
  boite.addEventListener('pointerleave', () => { visee.vx = 0; visee.vy = 0 })
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting }).observe(boite)
  let dernier = performance.now()
  const image = (maintenant) => {
    const dt = Math.min(0.05, (maintenant - dernier) / 1000)
    dernier = maintenant
    const t = maintenant / 1000
    if (visible && pack) {
      visee.x += (visee.vx - visee.x) * Math.min(1, dt * 6)
      visee.y += (visee.vy - visee.y) * Math.min(1, dt * 6)
      const p = borne((t - depart) / 0.9, 0, 1)
      const doux = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      const vie = calme ? 0 : 1
      pack.rotation.set(
        -visee.y * 0.25 + Math.sin(t * 0.7) * 0.04 * vie,
        visee.x * 0.6 + Math.sin(t * 0.6) * 0.24 * vie + cote * TOUR * (1 - doux),
        Math.sin(t * 0.5) * 0.03 * vie
      )
      pack.position.y = Math.sin(t * 0.9) * 0.04 * vie
      rendu.render(scene, camera)
    }
    requestAnimationFrame(image)
  }
  boite.prepend(toile)
  requestAnimationFrame(image)
  return {
    tourner(sens) {
      if (calme) return
      depart = performance.now() / 1000
      cote = sens < 0 ? -1 : 1
    },
    async changer(f) {
      try {
        await poser(f)
        this.tourner(1)
      } catch { /* le pack d'avant reste en place */ }
    },
  }
}
