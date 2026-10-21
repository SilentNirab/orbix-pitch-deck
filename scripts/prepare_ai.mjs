/** Generate static, accessible deck content directly from the preserved source copy. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const source = JSON.parse(await readFile(join(publicDir, 'deck.json'), 'utf8'))
const configuredUrl = new URL(process.env.SITE_URL || 'http://127.0.0.1:5188')
if (!['http:', 'https:'].includes(configuredUrl.protocol) || configuredUrl.username || configuredUrl.password
  || configuredUrl.search || configuredUrl.hash || configuredUrl.pathname !== '/') {
  throw new Error('SITE_URL must be an HTTP(S) origin without credentials, a base path, query, or fragment.')
}
const origin = configuredUrl.origin
const url = (path) => new URL(path, `${origin}/`).href
const html = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])
const xml = html
const markdownLabel = (value) => String(value).replace(/[\\[\]`*_<>]/g, '\\$&').replace(/\r?\n/g, ' ')
const markdownLink = (label, target) => `[${markdownLabel(label)}](<${target}>)`
const safeJson = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

if (typeof source.title !== 'string' || typeof source.sourceUrl !== 'string'
  || !Array.isArray(source.slides) || !source.slides.length) {
  throw new Error('deck.json must contain a title, sourceUrl, and nonempty slides array.')
}
const slideIds = new Set()
for (const slide of source.slides) {
  if (!Number.isInteger(slide.id) || slide.id < 1 || slideIds.has(slide.id)
    || !Number.isInteger(slide.sourcePage) || slide.sourcePage < 1
    || !['title', 'section', 'text', 'image', 'thumbnail'].every((key) => typeof slide[key] === 'string')
    || !['width', 'height'].every((key) => Number.isFinite(slide[key]) && slide[key] > 0)
    || ![slide.image, slide.thumbnail].every((path) => path.startsWith('/assets/'))) {
    throw new Error(`Invalid or duplicate source slide: ${slide.id}`)
  }
  slideIds.add(slide.id)
}

const sectionNames = [...new Set(source.slides.map((slide) => slide.section))]
const sections = sectionNames.map((title) => {
  const ids = source.slides.filter((slide) => slide.section === title).map((slide) => slide.id)
  const id = `section-${slug(title)}`
  return { id, title, slideCount: ids.length, slideIds: ids, readUrl: url(`/read/#${id}`) }
})
const slides = source.slides.map((slide) => ({
  id: slide.id, title: slide.title, section: slide.section, text: slide.text,
  textAvailability: slide.text.trim() ? 'extracted' : 'visual-only', sourcePage: slide.sourcePage,
  viewerUrl: url(`/#slide-${slide.id}`), readUrl: url(`/read/#slide-${slide.id}`),
  image: url(slide.image), thumbnail: url(slide.thumbnail), width: slide.width, height: slide.height,
}))
const deck = {
  schemaVersion: '1.0', title: source.title, language: 'en', website: 'https://www.orbix.studio/',
  sourceUrl: source.sourceUrl, slideCount: slides.length, sections, slides,
}
const visualOnly = slides.filter((slide) => slide.textAvailability === 'visual-only').length
const provenance = 'Content is a snapshot of the supplied Orbix Studio pitch deck, exported from Figma. '
  + 'Source text and line breaks are preserved, including repeated branding. Slides marked visual-only '
  + 'contain artwork with no extracted text; consult their original images or the PDF.'
const visualNote = 'Visual artwork only. No text was extracted from this slide. View the original image or PDF for its content.'
const jsonLd = {
  '@context': 'https://schema.org', '@type': 'PresentationDigitalDocument',
  '@id': `${url('/read/')}#deck`, name: deck.title, description: provenance, inLanguage: 'en',
  url: url('/read/'), isBasedOn: source.sourceUrl,
  author: { '@type': 'Organization', name: 'Orbix Studio', url: deck.website },
  encoding: { '@type': 'MediaObject', contentUrl: url('/assets/orbix-pitch-deck.pdf'), encodingFormat: 'application/pdf' },
  hasPart: slides.map((slide) => ({
    '@type': 'CreativeWork', '@id': slide.readUrl, position: slide.id, name: slide.title,
    text: slide.text, url: slide.readUrl, image: slide.image, isPartOf: { '@id': `${url('/read/')}#deck` },
  })),
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: url('/data/deck.schema.json'),
  title: 'Orbix Studio pitch deck', description: 'Preserved source copy and stable slide references.',
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'title', 'language', 'website', 'sourceUrl', 'slideCount', 'sections', 'slides'],
  properties: {
    schemaVersion: { const: '1.0' }, title: { type: 'string' }, language: { const: 'en' },
    website: { type: 'string', format: 'uri' }, sourceUrl: { type: 'string', format: 'uri' },
    slideCount: { type: 'integer', minimum: 1 },
    sections: { type: 'array', minItems: 1, items: { $ref: '#/$defs/section' } },
    slides: { type: 'array', minItems: 1, items: { $ref: '#/$defs/slide' } },
  },
  $defs: {
    section: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'slideCount', 'slideIds', 'readUrl'],
      properties: {
        id: { type: 'string', pattern: '^section-[a-z0-9-]+$' }, title: { type: 'string' },
        slideCount: { type: 'integer', minimum: 1 }, readUrl: { type: 'string', format: 'uri' },
        slideIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
      },
    },
    slide: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'section', 'text', 'textAvailability', 'sourcePage', 'viewerUrl', 'readUrl', 'image', 'thumbnail', 'width', 'height'],
      properties: {
        id: { type: 'integer', minimum: 1 }, title: { type: 'string' }, section: { type: 'string' },
        text: { type: 'string' }, textAvailability: { enum: ['extracted', 'visual-only'] },
        sourcePage: { type: 'integer', minimum: 1 },
        ...Object.fromEntries(['viewerUrl', 'readUrl', 'image', 'thumbnail'].map((key) => [key, { type: 'string', format: 'uri' }])),
        width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 },
      },
    },
  },
}

function sourceBlock(text) {
  const longestFence = Math.max(2, ...(text.match(/`+/g) || []).map((match) => match.length))
  const fence = '`'.repeat(longestFence + 1)
  return `${fence}text\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`
}

const markdown = `# ${markdownLabel(deck.title)}\n\n${provenance}\n\n`
  + `${slides.length} slides · ${sections.length} sections · ${visualOnly} visual-only slides\n\n`
  + `${markdownLink('Interactive viewer', url('/'))} · ${markdownLink('Readable HTML', url('/read/'))} · `
  + `${markdownLink('Structured JSON', url('/data/deck.json'))} · ${markdownLink('Original PDF', url('/assets/orbix-pitch-deck.pdf'))}\n\n`
  + `Source: ${markdownLink('Original Figma file', source.sourceUrl)}\n\n`
  + sections.map((section) => `## ${markdownLabel(section.title)}\n\n`
    + slides.filter((slide) => slide.section === section.title).map((slide) =>
      `### Slide ${slide.id}: ${markdownLabel(slide.title)}\n\n`
      + `Source PDF page: ${slide.sourcePage} · Text availability: ${slide.textAvailability}\n\n`
      + `${markdownLink('View slide', slide.viewerUrl)} · ${markdownLink('Read slide', slide.readUrl)} · ${markdownLink('Original image', slide.image)}\n\n`
      + (slide.textAvailability === 'extracted' ? sourceBlock(slide.text) : visualNote)).join('\n\n')).join('\n\n') + '\n'

const css = `
@font-face{font-family:'Neue Montreal';src:url('/assets/neue-montreal.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'Neue Montreal';src:url('/assets/neue-montreal-medium.woff2') format('woff2');font-weight:500 800;font-display:swap}
:root{font-family:'Neue Montreal',Arial,sans-serif;color:#010101;background:#f3f4f6;font-synthesis:none;line-height:1.65;--border:#e2e5eb;--dark:#010101}
*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#010101}a{color:#010101;text-underline-offset:4px}a:hover{color:#555}
a:focus-visible{outline:2px solid #010101;outline-offset:5px}h1,h2,h3,p{margin-top:0}h1,h2,h3{line-height:1.14;letter-spacing:-.035em;font-weight:400}
.skip{position:absolute;top:10px;left:10px;padding:10px;background:#fff;transform:translateY(-160%)}.skip:focus{transform:none}
.header{padding:24px max(24px,calc((100vw - 1180px)/2));border-bottom:1px solid #e2e5eb;display:flex;align-items:center;justify-content:space-between;gap:25px;background:#f3f4f6}
.brand{display:flex}.brand img{width:142px;height:auto}.viewer-link{background:#010101;color:#fff;padding:10px 20px;border-radius:30px;text-decoration:none;font-size:14px;white-space:nowrap}.viewer-link:hover{color:#fff;background:#262626}
main{max-width:1180px;margin:auto;padding:64px 24px 40px}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#646a77;margin-bottom:15px}
h1{font-size:clamp(36px,6vw,66px);max-width:850px;margin-bottom:24px}.intro{max-width:740px;color:#4b5262;font-size:17px}.formats{display:flex;flex-wrap:wrap;gap:10px 20px;padding:0;list-style:none;font-size:14px;margin:28px 0 45px}
.contents{padding:28px 30px;border:1px solid #e2e5eb;background:#ffffff;border-radius:12px;margin-bottom:70px}.contents h2{font-size:22px;margin-bottom:17px}.contents ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 30px;margin:0;padding-left:23px}.contents a{text-decoration:none}.contents span{color:#646a77;font-size:12px;margin-left:8px}
.deck-section{scroll-margin-top:25px;margin-bottom:65px}.section-heading{font-size:34px;padding-bottom:21px;border-bottom:1px solid #e2e5eb;margin-bottom:0}.slide{padding:37px 0 42px;border-bottom:1px solid #e2e5eb;scroll-margin-top:20px}.slide h3{font-size:27px;margin-bottom:22px}.slide .eyebrow{margin-bottom:11px;font-size:10px}
.slide-body{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:50px;align-items:start}.slide-copy{font:inherit;font-size:16px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;tab-size:2}.visual-note{background:#ffffff;border-left:3px solid #010101;padding:18px 21px;color:#4b5262;margin:0}
.slide-preview{margin:0}.slide-preview img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:#ffffff;border:1px solid #e2e5eb;border-radius:5px}.slide-preview figcaption{font-size:12px;color:#646a77;margin-top:10px}.slide-actions{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;margin-top:24px}
footer{max-width:1180px;padding:0 24px 40px;margin:auto;color:#646a77;font-size:12px}footer p{margin-bottom:10px}
@media(max-width:760px){.header{padding:20px 22px;flex-wrap:wrap;gap:12px}.brand{min-height:44px;align-items:center}.brand img{width:124px}.viewer-link{display:inline-flex;align-items:center;min-height:44px;font-size:12px;padding:8px 16px}main{padding:42px 22px 20px}.intro{font-size:16px}.formats a,.slide-actions a{display:inline-flex;align-items:center;min-height:44px}.contents{padding:22px;margin-bottom:45px}.contents ol{grid-template-columns:1fr}.contents a{display:block;min-height:44px;padding:8px 0}.contents span{display:inline-block}.section-heading{font-size:29px}.slide{padding:28px 0}.slide h3{font-size:24px}.slide-body{grid-template-columns:1fr;gap:25px}.slide-preview{max-width:360px}.slide-copy{font-size:15px}.slide-actions{gap:10px 18px}.deck-section{margin-bottom:44px}}
@media print{.header,.contents,.formats,.slide-actions,footer{display:none}main{padding:0;max-width:none}.slide{break-inside:avoid}.slide-body{grid-template-columns:minmax(0,1fr) 180px;gap:25px}a{color:inherit}.section-heading{break-after:avoid}}
`
const sectionHtml = sections.map((section) => `<section class="deck-section" id="${html(section.id)}" aria-labelledby="${html(section.id)}-heading">
<h2 class="section-heading" id="${html(section.id)}-heading">${html(section.title)}</h2>
${slides.filter((slide) => slide.section === section.title).map((slide) => `<article class="slide" id="slide-${slide.id}" aria-labelledby="slide-${slide.id}-heading">
<p class="eyebrow">Slide ${String(slide.id).padStart(2, '0')} / ${slides.length} · PDF page ${slide.sourcePage} · ${slide.textAvailability === 'extracted' ? 'Extracted source text' : 'Visual-only artwork'}</p>
<h3 id="slide-${slide.id}-heading">${html(slide.title)}</h3>
<div class="slide-body">
${slide.textAvailability === 'extracted' ? `<pre class="slide-copy">${html(slide.text)}</pre>` : `<p class="visual-note">${visualNote}</p>`}
<figure class="slide-preview"><a href="${html(slide.viewerUrl)}"><img src="${html(slide.thumbnail)}" width="480" height="270" loading="lazy" decoding="async" alt="Slide ${slide.id}: ${html(slide.title)}"></a><figcaption>Original slide artwork · ${slide.width} × ${slide.height}</figcaption></figure>
</div><nav class="slide-actions" aria-label="Slide ${slide.id} resources"><a href="${html(slide.viewerUrl)}">Open in viewer ↗</a><a href="${html(slide.image)}">Original image</a><a href="#slide-${slide.id}">Link to this slide</a></nav>
</article>`).join('\n')}
</section>`).join('\n')

const readHtml = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f3f4f6">
<link rel="icon" type="image/svg+xml" href="${html(url('/favicon.svg'))}">
<link rel="icon" type="image/png" sizes="32x32" href="${html(url('/favicon.png'))}">
<link rel="apple-touch-icon" sizes="180x180" href="${html(url('/apple-touch-icon.png'))}">
<title>${html(deck.title)} — Read the deck</title>
<meta name="description" content="Read all ${slides.length} Orbix Studio deck slides as accessible text, with original artwork, structured JSON, and Markdown downloads.">
<link rel="canonical" href="${html(url('/read/'))}">
<link rel="alternate" type="text/markdown" href="${html(url('/read/index.md'))}" title="Full deck Markdown">
<link rel="alternate" type="application/json" href="${html(url('/data/deck.json'))}" title="Structured deck data">
<link rel="describedby" type="text/plain" href="${html(url('/llms.txt'))}" title="AI content index">
<style>${css}</style>
<script type="application/ld+json">${safeJson(jsonLd)}</script>
</head><body>
<a class="skip" href="#content">Skip to deck content</a>
<header class="header"><a class="brand" href="${html(url('/'))}" aria-label="Orbix Studio pitch deck viewer"><img src="/assets/orbix-logo.svg" width="142" height="36" alt="Orbix Studio"></a><a class="viewer-link" href="${html(url('/'))}">Open slide viewer ↗</a></header>
<main id="content"><p class="eyebrow">Orbix Studio · Read the deck</p><h1>${html(deck.title)}</h1>
<p class="intro">All ${slides.length} slides, available as readable text. Browse by section, follow the original artwork, or take the content with you.</p>
<p class="intro">${html(provenance)}</p>
<ul class="formats" aria-label="Content formats"><li><a href="${html(url('/deck.md'))}">Markdown</a></li><li><a href="${html(url('/data/deck.json'))}">JSON data</a></li><li><a href="${html(url('/data/deck.schema.json'))}">JSON Schema</a></li><li><a href="${html(url('/llms.txt'))}">AI content index</a></li><li><a href="${html(url('/llms-full.txt'))}">Full text</a></li><li><a href="${html(url('/assets/orbix-pitch-deck.pdf'))}">Original PDF</a></li></ul>
<nav class="contents" aria-labelledby="contents-heading"><h2 id="contents-heading">Browse the deck</h2><ol>${sections.map((section) => `<li><a href="#${html(section.id)}">${html(section.title)}<span>${section.slideCount} ${section.slideCount === 1 ? 'slide' : 'slides'}</span></a></li>`).join('')}</ol></nav>
${sectionHtml}
</main><footer><p>Source: <a href="${html(source.sourceUrl)}">Original Figma file</a> · <a href="${html(deck.website)}">Orbix Studio website</a></p><p>${slides.length} slides · ${sections.length} sections · ${visualOnly} visual-only slides. <a href="#content">Back to top ↑</a></p></footer>
</body></html>
`

const llms = `# Orbix Studio

> The supplied Orbix Studio pitch deck: ${slides.length} original slides covering the studio, services, selected work, team, engagements, and next steps.

This index describes this deck only. Text exports preserve the supplied source copy. ${visualOnly} artwork slides have no extracted text and are explicitly marked visual-only; use their original images or the PDF. Figures and pricing belong to the supplied deck snapshot.

## Deck content

- ${markdownLink('Full deck Markdown', url('/deck.md'))}: Complete source copy, slide titles, sections, and stable links. Preferred starting point.
- ${markdownLink('Structured deck JSON', url('/data/deck.json'))}: All slide metadata and unmodified text, with textAvailability and source PDF pages.
- ${markdownLink('Deck JSON Schema', url('/data/deck.schema.json'))}: JSON Schema 2020-12 for the structured export.
- ${markdownLink('Readable deck', url('/read/'))}: Semantic HTML containing all slides without requiring JavaScript.
- ${markdownLink('Full deck text', url('/llms-full.txt'))}: Complete copy with provenance in a single text file.
- ${markdownLink('Original deck PDF', url('/assets/orbix-pitch-deck.pdf'))}: Original artwork and source material for visual-only slides.
- ${markdownLink('Interactive slide viewer', url('/'))}: Presentation with stable #slide-N links.
- ${markdownLink('Original Figma source', source.sourceUrl)}: Design source supplied for this deck.

## Sections

${sections.map((section) => `- ${markdownLink(section.title, section.readUrl)}: Slides ${section.slideIds[0]}–${section.slideIds.at(-1)}.`).join('\n')}
`
const sitemapUrls = [url('/'), url('/read/')]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((target) => `  <url><loc>${xml(target)}</loc></url>`).join('\n')}
</urlset>
`
const outputs = new Map([
  ['read/index.html', readHtml], ['read/index.md', markdown], ['deck.md', markdown], ['index.md', markdown],
  ['data/deck.json', `${JSON.stringify(deck, null, 2)}\n`],
  ['data/deck.schema.json', `${JSON.stringify(schema, null, 2)}\n`],
  ['data/deck.jsonld', `${JSON.stringify(jsonLd, null, 2)}\n`],
  ['llms.txt', llms], ['llms-full.txt', `Provenance: ${provenance}\n\n${markdown}`],
  ['robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap.xml')}\n`], ['sitemap.xml', sitemap],
])

for (const [relative, contents] of outputs) {
  const destination = join(publicDir, relative)
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp-${process.pid}`
  await writeFile(temporary, contents, 'utf8')
  await rename(temporary, destination)
}
console.log(`Prepared ${outputs.size} content files: ${slides.length} slides, ${sections.length} sections, ${visualOnly} visual-only slides. Origin: ${origin}`)
