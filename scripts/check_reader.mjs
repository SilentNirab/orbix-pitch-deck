/** Verify the static reader at phone, tablet, and desktop sizes without JavaScript. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = process.env.READER_TEST_URL || 'http://127.0.0.1:5188'
const output = join(root, 'design', 'reader-check')
const source = JSON.parse(await readFile(join(root, 'public', 'deck.json'), 'utf8'))
const sections = [...new Set(source.slides.map((slide) => slide.section))]
const sizes = [
  [320, 568], [360, 640], [375, 667], [390, 844], [414, 896],
  [568, 320], [844, 390], [768, 1024], [1024, 768], [1440, 900],
]
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height }, javaScriptEnabled: false,
      isMobile: width <= 1024, hasTouch: width <= 1024,
    })
    try {
      const page = await context.newPage()
      const response = await page.goto(`${origin}/read/`)
      assert.equal(response.status(), 200)
      await page.evaluate(() => document.fonts.ready)
      if (width === 320 || width === 390 || width === 1440) {
        await page.screenshot({ path: join(output, `reader-${width}x${height}.png`) })
        await page.locator('#slide-11').screenshot({ path: join(output, `slide-11-${width}x${height}.png`) })
        await page.keyboard.press('Control+Home')
      }
      const measurement = await page.evaluate(() => ({
        viewport: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        articles: [...document.querySelectorAll('article')].map((article) => ({
          id: article.id,
          text: article.querySelector('.slide-copy')?.textContent ?? '',
          width: article.getBoundingClientRect().width,
        })),
        overflow: [...document.querySelectorAll('body *')].filter((element) => {
          if (element.matches('.skip, script, style')) return false
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
        }).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 80) })),
        sectionLinks: [...document.querySelectorAll('.contents a')].map((link) => ({ text: link.textContent, href: link.getAttribute('href') })),
        imageWidths: [...document.querySelectorAll('.slide-preview img')].map((image) => image.getBoundingClientRect().width),
        header: [...document.querySelectorAll('.header a')].map((link) => ({
          text: link.textContent || link.getAttribute('aria-label'),
          width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height,
        })),
        smallTargets: [...document.querySelectorAll('.header a,.formats a,.contents a,.slide-actions a')]
          .filter((link) => link.getBoundingClientRect().height < 43.9)
          .map((link) => link.textContent || link.getAttribute('aria-label')),
      }))
      const failures = []
      if (measurement.viewport !== width) failures.push('Mobile viewport metadata is not applied')
      if (measurement.pageWidth > width + 1 || measurement.overflow.length) failures.push('Horizontal overflow')
      if (measurement.articles.length !== source.slides.length) failures.push('Missing slides')
      for (const slide of source.slides) {
        const article = measurement.articles.find((entry) => entry.id === `slide-${slide.id}`)
        if (!article || article.text !== slide.text) failures.push(`Source copy changed: ${slide.id}`)
      }
      if (measurement.imageWidths.length !== source.slides.length) failures.push('Missing artwork previews')
      if (measurement.imageWidths.some((imageWidth) => imageWidth < 1 || imageWidth > width)) failures.push('Artwork does not fit')
      if (measurement.sectionLinks.length !== sections.length
        || new Set(measurement.sectionLinks.map((link) => link.href)).size !== sections.length
        || sections.some((title) => !measurement.sectionLinks.some((link) => link.text.startsWith(title)))) failures.push('Missing section navigation')
      if (width <= 760 && measurement.smallTargets.length) failures.push('Mobile navigation target under 44px')
      for (const link of measurement.sectionLinks) {
        await page.locator(`.contents a[href="${link.href}"]`).click()
        const anchor = await page.locator(link.href).boundingBox()
        if (!anchor || anchor.y < -1 || anchor.y > height / 2) failures.push(`Section anchor missed: ${link.href}`)
      }
      await page.locator('footer a[href="#content"]').click()
      const heading = await page.locator('h1').boundingBox()
      if (!heading || heading.y < 0 || heading.y > height / 2) failures.push('Back to top failed')
      const result = { width, height, pageWidth: measurement.pageWidth, slides: measurement.articles.length, previews: measurement.imageWidths.length, sections: measurement.sectionLinks.length, header: measurement.header, overflow: measurement.overflow, failures }
      results.push(result)
      console.log(`${width}x${height}: ${failures.length ? 'FAIL' : 'PASS'} — ${measurement.pageWidth}px page, ${measurement.articles.length} slides`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
}
assert.ok(results.every((result) => result.failures.length === 0), `Reader checks failed; see ${output}`)
