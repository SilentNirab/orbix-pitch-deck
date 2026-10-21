/** Exercise real slide animation states in an isolated browser. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'design', 'motion-refresh')
const origin = process.env.MOTION_TEST_URL || 'http://127.0.0.1:5188'
const manifest = JSON.parse(await readFile(join(root, 'public', 'motion.json'), 'utf8'))
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const results = []
const atRest = (transform) => transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)'
const unclipped = (clip) => clip === 'none' || /^inset\(0(?:px|%)?(?: 0(?:px|%)?){0,3}\)$/.test(clip)
const styles = (page) => page.locator('.motion-artwork').evaluate((artwork) => ({
  composition: artwork.className,
  direction: artwork.dataset.direction,
  opacity: getComputedStyle(artwork).opacity,
  transform: getComputedStyle(artwork).transform,
  images: [...artwork.querySelectorAll('img')].map((image) => {
    const css = getComputedStyle(image)
    return { role: image.className, opacity: css.opacity, transform: css.transform, animation: css.animationName, clip: css.clipPath, delay: css.animationDelay, duration: css.animationDuration }
  }),
}))
async function open(page, id) {
  await page.goto(`${origin}/#slide-${id}`)
  await page.locator(`.slide-progress[aria-valuenow="${id}"]`).waitFor()
  await page.locator('.motion-artwork.is-ready').waitFor()
  const pause = page.getByRole('button', { name: 'Pause slideshow', exact: true })
  if (await pause.count()) await pause.click()
}
async function seek(page, milliseconds) {
  await page.locator('.motion-artwork').evaluate((artwork, time) => {
    for (const animation of artwork.getAnimations({ subtree: true })) {
      animation.pause()
      animation.currentTime = time
    }
  }, milliseconds)
}
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  try {
    const page = await context.newPage()
    for (const [id, composition] of [[1, 'cover'], [6, 'statement'], [13, 'editorial'], [25, 'showcase'], [41, 'editorial'], [42, 'cards'], [57, 'editorial']]) {
      await open(page, id)
      await seek(page, 0)
      const start = await styles(page)
      assert.ok(start.composition.includes(`composition-${composition}`))
      assert.ok(start.images.some((image) => !atRest(image.transform)), `Slide ${id} has no entrance`)
      if (composition !== 'showcase') {
        const text = start.images.filter((image) => image.role.includes('motion-text'))
        assert.ok(text.length > 0 && text.every((image) => image.opacity === '0' && !atRest(image.transform)), `Slide ${id} text has no entrance`)
        assert.ok(text.filter((image) => image.role.includes('heading')).every((image) => !unclipped(image.clip)), `Slide ${id} headline does not reveal`)
      }
      const paintedLayers = await page.locator('.motion-text').evaluateAll((images) => images.map((image) => {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let painted = 0
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++
        return { src: image.getAttribute('src'), painted }
      }))
      assert.equal(paintedLayers.length, manifest.slides.find((slide) => slide.id === id).layers.length, `Slide ${id} dropped its text layers`)
      if (composition !== 'showcase') assert.ok(paintedLayers.length > 0, `Slide ${id} has no text layers`)
      assert.ok(paintedLayers.every((layer) => layer.painted > 0), `Slide ${id} contains invisible text assets: ${JSON.stringify(paintedLayers)}`)
      if (id === 41) {
        for (const time of [0, 300, 700, 1600, 3000]) {
          await seek(page, time)
          await page.locator('.slide-stage').screenshot({ path: join(output, `slide-41-${time}ms.png`) })
        }
      }
      await seek(page, 1700)
      const readable = await styles(page)
      assert.ok(readable.images.filter((image) => image.role.includes('motion-text')).every((image) => image.opacity === '1' && atRest(image.transform) && unclipped(image.clip)), `Slide ${id} text takes too long`)
      await seek(page, 3000)
      const settled = await styles(page)
      assert.equal(settled.opacity, '1')
      assert.ok(atRest(settled.transform))
      assert.ok(settled.images.every((image) => image.opacity === '1' && atRest(image.transform) && unclipped(image.clip)), `Slide ${id} does not settle`)
      results.push({ slide: id, paintedLayers, start, settled })
    }
    await open(page, 41)
    await page.getByRole('button', { name: 'Replay slide animation', exact: true }).click()
    await page.locator('.motion-artwork.is-ready').waitFor()
    const replay = await page.locator('.motion-artwork').evaluate((artwork) => artwork.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'))
    assert.equal(replay, true)
    await page.getByRole('button', { name: 'Next slide', exact: true }).click()
    await page.locator('.slide-progress[aria-valuenow="42"]').waitFor()
    await page.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await page.locator('.slide-progress[aria-valuenow="41"]').waitFor()
    await page.locator('.motion-artwork.is-ready').waitFor()
    assert.equal((await styles(page)).direction, 'backward')
    await page.getByRole('button', { name: 'Slide animation', exact: true }).click()
    await page.locator('.motion-artwork.is-ready .motion-original').waitFor()
    assert.equal(await page.locator('.motion-text').count(), 0)
    assert.ok((await styles(page)).images.every((image) => image.animation === 'none'))
    console.log('Seven compositions, readable/settled frames, replay, reverse navigation, and Motion off: PASS')
  } finally {
    await context.close()
  }
  for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true })
    try {
      const page = await context.newPage()
      await open(page, 41)
      await seek(page, 3000)
      const layout = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth, footer: document.querySelector('.viewer-footer').getBoundingClientRect().bottom }))
      assert.equal(layout.width, width)
      assert.ok(layout.pageWidth <= width)
      assert.ok(layout.footer <= height)
      await page.screenshot({ path: join(output, `mobile-${width}x${height}.png`) })
      console.log(`${width}x${height}: controls fit; no horizontal overflow`)
    } finally {
      await context.close()
    }
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
  try {
    const page = await reduced.newPage()
    await open(page, 41)
    assert.equal(await page.locator('.motion-text').count(), 0)
    const artwork = await styles(page)
    assert.equal(artwork.transform, 'none')
    assert.ok(artwork.images.every((image) => image.animation === 'none' && image.transform === 'none'))
    console.log('Reduced motion: static original artwork, no transform or animation')
  } finally {
    await reduced.close()
  }
  const fallback = await browser.newContext()
  try {
    const page = await fallback.newPage()
    const failedLayer = manifest.slides.find((slide) => slide.id === 41).layers[0].src
    await page.route(`${origin}${failedLayer}`, (route) => route.abort())
    await open(page, 41)
    assert.equal(await page.locator('.motion-original').count(), 1)
    assert.equal(await page.locator('.motion-text').count(), 0)
    assert.ok((await page.locator('.toast').innerText()).includes('Showing original artwork'))
    console.log('Failed animation layer: original artwork fallback is ready')
  } finally {
    await fallback.close()
  }
} finally {
  await browser.close()
}
await writeFile(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
