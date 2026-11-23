// Les pièces communes du site : sons, alertes, connexion du wallet. Chargé par la landing et par l'app, avant leur
// propre script. Tout est enfermé ici ; les pages se servent de window.gachiz (son, dire) et écoutent l'événement
// « gachiz:wallet » pour savoir si un wallet est connecté.
(() => {
const BASE = new URL('.', document.currentScript.src) // la racine du site, d'où que la page soit servie
const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
// ---------- Sons : de vrais sons enregistrés, retravaillés. Toujours à la suite d'un geste. ----------
const sonBouton = document.getElementById('son-bouton')
const pistes = {}
let sonActif = true
try { sonActif = localStorage.getItem('gz-son') !== '0' } catch { /* stockage refusé : le son reste actif */ }
function son(nom) {
  if (!sonActif) return
  let piste = pistes[nom]
  if (!piste) {
    piste = pistes[nom] = new Audio(new URL(`sounds/${nom}.mp3`, BASE).href)
    piste.volume = 0.5
  }
  try {
    piste.currentTime = 0
    const lecture = piste.play()
    if (lecture) lecture.catch(() => {})
  } catch { /* pas de son : le geste répond déjà à l'écran */ }
}
if (sonBouton) {
  const montrer = () => {
    sonBouton.setAttribute('aria-pressed', String(sonActif))
    ;(sonBouton.querySelector('span') || sonBouton).textContent = sonActif ? 'Sound on' : 'Sound off'
  }
  montrer()
  sonBouton.addEventListener('click', () => {
    sonActif = !sonActif
    try { localStorage.setItem('gz-son', sonActif ? '1' : '0') } catch { /* sans stockage, le choix tient jusqu'au rechargement */ }
    montrer()
    son('tape')
  })
}

// ---------- Alertes : un geste répond toujours. Trois au plus, la plus récente en bas. ----------
const piece = (balise, classe, texte) => {
  const e = document.createElement(balise)
  if (classe) e.className = classe
  if (texte) e.textContent = texte
  return e
}
function dire(titre, { texte = '', type = 'info', action = null, duree = 3600, bruit = null } = {}) {
  const carte = piece('div', `alerte alerte-${type}`)
  carte.setAttribute('role', type === 'alerte' ? 'alert' : 'status')
  carte.style.setProperty('--duree', `${duree}ms`)
  const fermer = piece('button', 'croix')
  fermer.type = 'button'
  fermer.setAttribute('aria-label', 'Dismiss')
  const temps = piece('span', 'alerte-temps')
  const sortir = () => {
    if (carte.classList.contains('sort')) return
    carte.classList.add('sort')
    setTimeout(() => carte.remove(), calme ? 0 : 180)
  }
  carte.append(piece('span', 'alerte-voyant'), piece('p', 'alerte-titre', titre), fermer)
  if (texte) carte.append(piece('p', 'alerte-texte', texte))
  if (action) {
    const b = piece('button', 'puce alerte-action', action.texte)
    b.type = 'button'
    b.addEventListener('click', () => { sortir(); action.faire() })
    carte.append(b)
  }
  carte.append(temps)
  fermer.addEventListener('click', () => { son('ferme'); sortir() })
  temps.addEventListener('animationend', sortir) // la barre s'arrête sous le curseur : l'alerte reste tant qu'on la lit
  if (calme) setTimeout(sortir, duree)
  const alertes = document.getElementById('alertes')
  while (alertes.children.length >= 3) alertes.firstElementChild.remove()
  alertes.append(carte)
  son(bruit || (type === 'valide' ? 'valide' : type === 'alerte' ? 'alerte' : 'ouvre'))
}
// ---------- Les pièces posées dans la page si elle ne les a pas : la zone d'alertes et le pop-up de connexion ----------
if (!document.getElementById('alertes')) {
  const zone = piece('div', 'alertes')
  zone.id = 'alertes'
  zone.setAttribute('role', 'region')
  zone.setAttribute('aria-label', 'Notifications')
  zone.setAttribute('aria-live', 'polite')
  document.body.append(zone)
}
if (!document.getElementById('gz-connect')) {
  const d = piece('dialog', 'fenetre')
  d.id = 'gz-connect'
  d.tabIndex = -1
  d.setAttribute('aria-labelledby', 'gz-connect-titre')
  const tete = piece('div', 'fenetre-tete')
  const image = document.createElement('img')
  image.src = new URL('icons/marge.webp', BASE).href
  image.alt = ''
  image.width = image.height = 56
  const texte = document.createElement('div')
  const titre = piece('h2', '', 'Connect a wallet')
  titre.id = 'gz-connect-titre'
  texte.append(titre, piece('p', '', 'Read-only. Gachiz sees your address and your network. No transaction is sent.'))
  const croix = piece('button', 'croix')
  croix.id = 'gz-connect-fermer'
  croix.type = 'button'
  croix.setAttribute('aria-label', 'Close')
  tete.append(image, texte, croix)
  const corps = piece('div', 'fenetre-corps')
  corps.id = 'gz-connect-liste'
  const erreur = piece('p', 'fenetre-erreur')
  erreur.id = 'gz-connect-erreur'
  erreur.setAttribute('role', 'alert')
  erreur.hidden = true
  d.append(tete, corps, erreur, piece('p', 'fenetre-pied', 'Network: Robinhood Chain, chain id 4663.'))
  document.body.append(d)
}
// ---------- Wallet : vrai connect (EIP-6963, puis window.ethereum). Lecture seule, aucune transaction. ----------
const ROBINHOOD_CHAIN = '0x1237' // 4663
// Une page sans bouton de connexion (la doc) garde les sons et les alertes : le wallet reste alors hors de la page.
const walletBouton = document.getElementById('wallet-bouton') || document.createElement('button')
const walletMenu = document.getElementById('wallet-menu') || document.createElement('div')
const fenetre = document.getElementById('gz-connect')
const liste = document.getElementById('gz-connect-liste')
const erreurConnect = document.getElementById('gz-connect-erreur')
const fournisseurs = new Map()
let actif = null // { provider, nom, adresse, chaine }
let enCours = false

const court = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`
function fermerMenu() {
  walletMenu.hidden = true
  if (!fenetre.open) walletBouton.setAttribute('aria-expanded', 'false')
}
function ouvrirMenu(remplirMenu) {
  walletMenu.replaceChildren()
  remplirMenu(walletMenu)
  walletMenu.hidden = false
  walletBouton.setAttribute('aria-expanded', 'true')
}
function choixMenu(texte, action) {
  const b = piece('button', 'menu-choix', texte)
  b.type = 'button'
  b.addEventListener('click', action)
  return b
}
function afficher() {
  walletBouton.removeAttribute('aria-busy')
  walletBouton.textContent = actif ? court(actif.adresse) : 'Connect'
  walletBouton.setAttribute('aria-haspopup', actif ? 'true' : 'dialog')
  const detail = actif ? { adresse: actif.adresse, court: court(actif.adresse), nom: actif.nom, reseau: actif.chaine === ROBINHOOD_CHAIN ? 'Robinhood Chain' : 'another network' } : null
  document.dispatchEvent(new CustomEvent('gachiz:wallet', { detail }))
}

// Le pop-up : les wallets trouvés dans le navigateur, ou l'état vide.
function remplir() {
  const trouves = [...fournisseurs.values()]
  if (!trouves.length && window.ethereum) trouves.push({ info: { name: 'Browser wallet', icon: null }, provider: window.ethereum })
  liste.replaceChildren()
  erreurConnect.hidden = true
  if (!trouves.length) {
    const vide = piece('div', 'fenetre-vide')
    vide.append(piece('strong', '', 'No wallet found in this browser.'), 'Install a wallet extension, then reload this page.')
    liste.append(vide)
    return
  }
  for (const f of trouves) {
    const b = piece('button', 'wallet-choix')
    b.type = 'button'
    if (f.info.icon && /^data:image\//.test(f.info.icon)) {
      const img = document.createElement('img')
      img.src = f.info.icon // le logo que le wallet annonce lui-même
      img.alt = ''
      b.append(img)
    } else b.append(piece('span', 'sans-logo'))
    b.append(f.info.name, piece('span', 'etiquette', 'Detected'))
    b.addEventListener('click', () => connecter(f, b))
    liste.append(b)
  }
}
function ouvrirFenetre() {
  remplir()
  fenetre.classList.remove('sort')
  fenetre.showModal()
  fenetre.focus() // le focus sur la fenêtre, pas sur la croix : Tab mène au premier wallet
  walletBouton.setAttribute('aria-expanded', 'true')
  son('ouvre')
}
function fermerFenetre(sansBruit) {
  if (!fenetre.open || fenetre.classList.contains('sort')) return
  walletBouton.setAttribute('aria-expanded', 'false')
  if (!sansBruit) son('ferme')
  if (calme) return fenetre.close()
  fenetre.classList.add('sort') // la sortie est plus courte que l'entrée
  setTimeout(() => { fenetre.classList.remove('sort'); fenetre.close() }, 160)
}
fenetre.addEventListener('cancel', (e) => { e.preventDefault(); fermerFenetre() })
fenetre.addEventListener('click', (e) => { if (e.target === fenetre) fermerFenetre() })
document.getElementById('gz-connect-fermer').addEventListener('click', () => fermerFenetre())

addEventListener('eip6963:announceProvider', (e) => {
  const { info, provider } = e.detail || {}
  if (!info || !provider || !info.uuid) return
  fournisseurs.set(info.uuid, { info, provider })
  if (fenetre.open && !enCours) remplir()
})
dispatchEvent(new Event('eip6963:requestProvider'))

function prevenirReseau(provider) {
  dire('Your wallet is on another network', {
    texte: 'Gachiz runs on Robinhood Chain.',
    type: 'alerte',
    duree: 9000,
    action: {
      texte: 'Switch network',
      faire: async () => {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ROBINHOOD_CHAIN }] })
        } catch (erreur) {
          dire(erreur && erreur.code === 4902 ? 'Add Robinhood Chain to your wallet first' : 'The network did not change', { type: 'alerte' })
        }
      },
    },
  })
}
async function connecter({ info, provider }, bouton) {
  if (enCours) return
  enCours = true
  erreurConnect.hidden = true
  for (const b of liste.querySelectorAll('button')) b.disabled = b !== bouton
  bouton.setAttribute('aria-busy', 'true')
  const etiquette = bouton.querySelector('.etiquette')
  etiquette.replaceChildren(piece('span', 'anneau'), 'Waiting for your wallet')
  walletBouton.setAttribute('aria-busy', 'true')
  try {
    const comptes = await provider.request({ method: 'eth_requestAccounts' })
    if (!comptes || !comptes[0]) throw new Error('aucun compte')
    const chaine = await provider.request({ method: 'eth_chainId' }).catch(() => null)
    actif = { provider, nom: info.name, adresse: comptes[0], chaine }
    provider.on?.('accountsChanged', (comptesNeufs) => {
      if (!actif || actif.provider !== provider) return
      actif = comptesNeufs && comptesNeufs[0] ? { ...actif, adresse: comptesNeufs[0] } : null
      afficher()
    })
    provider.on?.('chainChanged', (id) => {
      if (!actif || actif.provider !== provider) return
      actif.chaine = id
      afficher()
      if (id === ROBINHOOD_CHAIN) dire('Network: Robinhood Chain', { type: 'valide' })
    })
    fermerFenetre(true)
    dire('Wallet connected', { texte: `${info.name} · ${court(comptes[0])}`, type: 'valide' })
    if (chaine !== ROBINHOOD_CHAIN) setTimeout(() => prevenirReseau(provider), 1200)
  } catch (erreur) {
    erreurConnect.textContent = erreur && erreur.code === 4001 ? 'Connection cancelled in the wallet.' : 'The wallet did not connect. Try again.'
    erreurConnect.hidden = false
    son('alerte')
    for (const b of liste.querySelectorAll('button')) b.disabled = false
    bouton.removeAttribute('aria-busy')
    etiquette.textContent = 'Detected'
  }
  enCours = false
  afficher()
}
walletBouton.addEventListener('click', () => {
  if (!walletMenu.hidden) return fermerMenu()
  if (!actif) return ouvrirFenetre()
  ouvrirMenu((menu) => {
    menu.append(
      piece('p', 'adresse', court(actif.adresse)),
      piece('p', '', `${actif.nom} · ${actif.chaine === ROBINHOOD_CHAIN ? 'Robinhood Chain' : 'another network'}`),
      choixMenu('Copy address', () => {
        const adresse = actif.adresse
        fermerMenu()
        navigator.clipboard.writeText(adresse).then(() => dire('Address copied', { type: 'valide' }), () => dire('The address was not copied', { type: 'alerte' }))
      }),
      choixMenu('Disconnect', () => {
        actif = null
        fermerMenu()
        afficher()
        dire('Wallet disconnected', { bruit: 'ferme' })
      }),
    )
  })
})
addEventListener('click', (e) => { if (!walletMenu.hidden && !e.target.closest('.wallet')) fermerMenu() })
addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerMenu() })

// ---------- Le jeton GACHIZ : son adresse de contrat, à copier. Elle ne s'écrit qu'ici. ----------
// Tant que JETON_ADRESSE est vide, le site dit qu'elle n'existe pas encore : aucune adresse n'est inventée.
const JETON_ADRESSE = ''
for (const e of document.querySelectorAll('[data-jeton-ca]')) e.textContent = JETON_ADRESSE ? court(JETON_ADRESSE) : 'CA soon'
if (JETON_ADRESSE) for (const e of document.querySelectorAll('[data-jeton-texte]')) e.textContent = JETON_ADRESSE
for (const b of document.querySelectorAll('[data-jeton]')) {
  b.addEventListener('click', () => {
    if (!JETON_ADRESSE) return dire('GACHIZ has no contract address yet', { texte: 'Any address you see elsewhere is not ours.' })
    navigator.clipboard.writeText(JETON_ADRESSE).then(
      () => dire('Contract address copied', { texte: court(JETON_ADRESSE), type: 'valide' }),
      () => dire('The address was not copied', { type: 'alerte' })
    )
  })
}

window.gachiz = { son, dire }
afficher()
})()