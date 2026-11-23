// Gachiz, la doc : « Copy for AI ». Tout le reste de la doc marche sans script.
// Le bouton copie le texte de la page (titre, sections, listes, tableaux en texte), précédé d'une demande simple.
'use strict'
const AMORCE = 'Explain this page of the Gachiz docs to me in simple words.'
const pageVue = () => document.querySelector('.doc:target') || [...document.querySelectorAll('.doc')].find((d) => d.querySelector(':target')) || document.getElementById('overview')

function texteDe(article) {
  const lignes = [AMORCE, '']
  for (const e of article.querySelectorAll('.d-col h1, .d-col h2, .d-col p, .d-col li, .d-col tr, .d-col dt, .d-col dd')) {
    if (e.closest('.d-ia, .d-pager, .d-ann-zone, .d-toc, svg')) continue
    if (e.tagName === 'P' && e.closest('li, td')) continue
    const t = e.tagName === 'TR' ? [...e.children].map((c) => c.innerText.trim()).join(' | ') : e.innerText.trim().replace(/\s+/g, ' ')
    if (!t) continue
    lignes.push(e.tagName === 'H1' ? `# ${t}` : e.tagName === 'H2' ? `\n## ${t}` : e.tagName === 'LI' ? `- ${t}` : t)
  }
  lignes.push('', `Source: ${location.origin}/docs/#${article.id}`)
  return lignes.join('\n')
}

// La réponse à un geste : l'alerte du site si elle est là, sinon une ligne en bas à droite.
let ligne
let fin
function dire(texte, type = 'valide') {
  if (window.gachiz && window.gachiz.dire) return window.gachiz.dire(texte, { type })
  if (!ligne) {
    ligne = document.createElement('p')
    ligne.className = 'd-toast'
    ligne.setAttribute('role', 'status')
    document.body.append(ligne)
  }
  ligne.textContent = texte
  ligne.classList.add('est-la')
  clearTimeout(fin)
  fin = setTimeout(() => ligne.classList.remove('est-la'), 2800)
}
async function copier(article, message) {
  try {
    await navigator.clipboard.writeText(texteDe(article))
    dire(message)
  } catch {
    dire('The copy did not work. Use the plain text link in the menu.', 'alerte')
  }
}
for (const b of document.querySelectorAll('.d-ia-copie')) {
  b.hidden = false
  b.addEventListener('click', () => {
    if (window.gachiz && window.gachiz.son) window.gachiz.son('tape')
    copier(b.closest('.doc') || pageVue(), 'Copied. Paste it into your AI.')
  })
}
