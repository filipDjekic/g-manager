import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'

const root = resolve(import.meta.dirname, '../../..')
const source = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const protectionSource = readFileSync(resolve(root, '.github/branch-protection.json'), 'utf8')

function validate(workflowSource) {
  const workflow = parseDocument(workflowSource).toJS()
  const protection = JSON.parse(protectionSource)
  const required = new Set(protection.required_status_checks.contexts)
  const jobNames = new Set(Object.values(workflow.jobs).map((job) => job.name))

  if (workflow.permissions?.contents !== 'read') throw new Error('Workflow root permissions must be contents: read')
  for (const context of required) {
    if (!jobNames.has(context)) throw new Error(`Missing required check job: ${context}`)
  }

  const actionPattern = /uses:\s*([^\s]+)@([^\s]+)/g
  for (const [, action, revision] of workflowSource.matchAll(actionPattern)) {
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`${action} is not pinned to a full commit SHA`)
  }
  if (!workflowSource.includes('retention-days:')) throw new Error('Artifact retention must be explicit')
  if (!workflowSource.includes('failure()')) throw new Error('Failure-only E2E artifacts are required')
  return { jobs: jobNames.size, checks: required.size }
}

const result = validate(source)
if (process.argv.includes('--self-test')) {
  let rejected = false
  try {
    validate(source.replace(/@[a-f0-9]{40}/, '@v4'))
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('CI contract accepted a deliberately unpinned action')
  console.log('CI contract negative self-test passed: deliberately unpinned action was rejected.')
} else {
  console.log(`CI contract valid: ${result.jobs} jobs, ${result.checks} required checks, all actions SHA-pinned.`)
}
