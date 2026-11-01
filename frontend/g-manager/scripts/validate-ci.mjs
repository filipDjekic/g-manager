import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'

const root = resolve(import.meta.dirname, '../../..')
const source = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const releaseSource = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')
const frontendPackage = JSON.parse(readFileSync(resolve(root, 'frontend/g-manager/package.json'), 'utf8'))
const frontendDockerfile = readFileSync(resolve(root, 'frontend/g-manager/Dockerfile'), 'utf8')
const protectionSource = readFileSync(resolve(root, '.github/branch-protection.json'), 'utf8')

function validate(workflowSource, releaseWorkflowSource = releaseSource) {
  const workflow = parseDocument(workflowSource).toJS()
  const protection = JSON.parse(protectionSource)
  const required = new Set(protection.required_status_checks.contexts)
  const jobNames = new Set(Object.values(workflow.jobs).map((job) => job.name))

  if (workflow.permissions?.contents !== 'read') throw new Error('Workflow root permissions must be contents: read')
  if (workflow.jobs.codeql?.permissions?.actions !== 'read') throw new Error('CodeQL requires actions: read to inspect private workflow runs')
  if (workflow.jobs.secrets?.permissions?.['pull-requests'] !== 'read') throw new Error('Secret scan requires pull-requests: read to inspect PR commits')
  const dockerNode = frontendDockerfile.match(/^FROM node:([\d.]+)-/m)?.[1]
  const dockerNpm = frontendDockerfile.match(/^ARG NPM_VERSION=([\d.]+)/m)?.[1]
  if (workflow.env.NODE_VERSION !== dockerNode || workflow.env.NPM_VERSION !== dockerNpm
      || frontendPackage.packageManager !== `npm@${dockerNpm}`) {
    throw new Error('Frontend Node/npm versions must agree across CI, Docker and packageManager')
  }
  for (const context of required) {
    if (!jobNames.has(context)) throw new Error(`Missing required check job: ${context}`)
  }

  const actionPattern = /uses:\s*([^\s]+)@([^\s]+)/g
  for (const [, action, revision] of `${workflowSource}\n${releaseWorkflowSource}`.matchAll(actionPattern)) {
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`${action} is not pinned to a full commit SHA`)
  }
  if (!workflowSource.includes('retention-days:')) throw new Error('Artifact retention must be explicit')
  if (!workflowSource.includes('failure()')) throw new Error('Failure-only E2E artifacts are required')
  return { jobs: jobNames.size, checks: required.size }
}

const result = validate(source)
if (process.argv.includes('--self-test')) {
  const invalidWorkflows = [
    [source.replace(/@[a-f0-9]{40}/, '@v4'), releaseSource],
    [source, releaseSource.replace(/@[a-f0-9]{40}/, '@v4')],
    [source.replace('      actions: read', '      actions: none'), releaseSource],
    [source.replace('      pull-requests: read', '      pull-requests: none'), releaseSource],
    [source.replace(/NPM_VERSION: '[\d.]+'/, "NPM_VERSION: '0.0.0'"), releaseSource],
  ]
  for (const [invalidSource, invalidRelease] of invalidWorkflows) {
    let rejected = false
    try {
      validate(invalidSource, invalidRelease)
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('CI contract accepted a deliberately invalid workflow')
  }
  console.log('CI contract negative self-tests passed: CI/release pins, CodeQL/PR scan permissions and npm versions were enforced.')
} else {
  console.log(`CI contract valid: ${result.jobs} jobs, ${result.checks} required checks, all actions SHA-pinned.`)
}
