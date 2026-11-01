import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument, stringify } from 'yaml'

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
  const codeql = workflow.jobs.codeql
  const steps = codeql.steps
  const init = steps.find((step) => step.uses?.startsWith('github/codeql-action/init@'))
  const analyze = steps.find((step) => step.uses?.startsWith('github/codeql-action/analyze@'))
  const gate = steps.find((step) => step.run === 'python3 -B scripts/check_codeql_sarif.py codeql-results')
  const gateTest = steps.find((step) => step.run === "python3 -B -m unittest discover -s scripts -p 'test_check_codeql_sarif.py'")
  const compile = steps.find((step) => step.run === './mvnw -B -DskipTests compile' && step['working-directory'] === 'gm')
  const artifact = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@')
    && step.with?.path === 'codeql-results/*.sarif')
  if (init?.with?.languages !== 'java-kotlin,javascript-typescript'
      || analyze?.with?.upload !== 'never' || analyze.with.output !== 'codeql-results') {
    throw new Error('CodeQL must analyze both languages and generate SARIF with upload: never')
  }
  const blockingSteps = [init, compile, analyze, gateTest, gate]
  if (!blockingSteps.every(Boolean) || codeql.if !== undefined
      || [codeql, ...blockingSteps].some((step) => step['continue-on-error'] !== undefined && step['continue-on-error'] !== false)
      || blockingSteps.some((step) => step.if !== undefined)
      || !blockingSteps.every((step, index) => index === 0 || steps.indexOf(blockingSteps[index - 1]) < steps.indexOf(step))) {
    throw new Error('CodeQL compilation, analysis and tested SARIF gate must run in order and fail on errors')
  }
  if (!artifact || artifact.if !== 'always()' || !artifact.with['retention-days']
      || steps.indexOf(artifact) <= steps.indexOf(gate)) {
    throw new Error('CodeQL SARIF artifacts must be retained even when analysis or the gate fails')
  }
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
  validate(stringify(parseDocument(source).toJS()))
  const changeCodeql = (change) => {
    const workflow = parseDocument(source).toJS()
    change(workflow.jobs.codeql)
    return [stringify(workflow), releaseSource]
  }
  const analyzeStep = (job) => job.steps.find((step) => step.uses?.startsWith('github/codeql-action/analyze@'))
  const gateStep = (job) => job.steps.find((step) => step.run?.includes('scripts/check_codeql_sarif.py'))
  const invalidWorkflows = [
    [source.replace(/@[a-f0-9]{40}/, '@v4'), releaseSource],
    [source, releaseSource.replace(/@[a-f0-9]{40}/, '@v4')],
    [source.replace('      actions: read', '      actions: none'), releaseSource],
    [source.replace('      pull-requests: read', '      pull-requests: none'), releaseSource],
    [source.replace(/NPM_VERSION: '[\d.]+'/, "NPM_VERSION: '0.0.0'"), releaseSource],
    changeCodeql((job) => { analyzeStep(job).with.upload = 'always' }),
    changeCodeql((job) => { delete analyzeStep(job).with.output }),
    changeCodeql((job) => { job.steps.find((step) => step.with?.languages).with.languages = 'java-kotlin' }),
    changeCodeql((job) => { analyzeStep(job)['continue-on-error'] = true }),
    changeCodeql((job) => { gateStep(job)['continue-on-error'] = true }),
    changeCodeql((job) => { gateStep(job).if = 'false' }),
    changeCodeql((job) => { job.steps = job.steps.filter((step) => step !== gateStep(job)) }),
    changeCodeql((job) => { job.steps.find((step) => step.with?.path === 'codeql-results/*.sarif').if = 'success()' }),
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
  console.log(`CI contract negative self-tests passed: ${invalidWorkflows.length} invalid configurations rejected, including CodeQL analysis, SARIF gate and artifacts.`)
} else {
  console.log(`CI contract valid: ${result.jobs} jobs, ${result.checks} required checks, all actions SHA-pinned.`)
}
