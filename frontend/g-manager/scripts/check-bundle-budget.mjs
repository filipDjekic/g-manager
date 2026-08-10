import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = new URL('../dist/', import.meta.url)
const budget = JSON.parse(readFileSync(new URL('../../../performance/budgets.json', import.meta.url), 'utf8'))
const assetsDirectory = new URL('assets/', dist)
const assetsPath = fileURLToPath(assetsDirectory)
const assets = readdirSync(assetsDirectory).filter((name) => name.endsWith('.js'))
const sizes = assets.map((name) => ({ name, bytes: statSync(join(assetsPath, name)).size }))
const html = readFileSync(new URL('index.html', dist), 'utf8')
const initialNames = sizes.filter(({ name }) => html.includes(name)).map(({ name }) => name)
const initialBytes = sizes.filter(({ name }) => initialNames.includes(name))
  .reduce((total, asset) => total + asset.bytes, 0)
const largestRouteBytes = Math.max(0, ...sizes.filter(({ name }) => !initialNames.includes(name))
  .map(({ bytes }) => bytes))

console.log(JSON.stringify({ initialBytes, largestRouteBytes, assets: sizes }, null, 2))
if (initialBytes > budget.frontend.initialJavaScriptBytes) {
  throw new Error(`Initial JavaScript ${initialBytes} exceeds ${budget.frontend.initialJavaScriptBytes} bytes`)
}
if (largestRouteBytes > budget.frontend.maxRouteJavaScriptBytes) {
  throw new Error(`Route JavaScript ${largestRouteBytes} exceeds ${budget.frontend.maxRouteJavaScriptBytes} bytes`)
}
