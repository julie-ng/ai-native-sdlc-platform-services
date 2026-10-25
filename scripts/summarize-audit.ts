import { readFile } from 'node:fs/promises'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return String(value ?? '').replace(/[&<>|`\r\n]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '|': '&#124;',
    '`': '&#96;',
    '\r': ' ',
    '\n': ' ',
  })[character]!)
}

try {
  const report: unknown = JSON.parse(await readFile(process.argv[2], 'utf8'))
  if (!isRecord(report) || report.error || !isRecord(report.vulnerabilities)) {
    throw new Error('npm audit did not return a vulnerability report. Check the audit step logs and retry.')
  }

  const findings = Object.entries(report.vulnerabilities).filter(([, vulnerability]) =>
    isRecord(vulnerability) && ['high', 'critical'].includes(String(vulnerability.severity)),
  )

  console.log('## Dependency audit\n')
  console.log('Informational only; audit findings do not block CI. Includes development dependencies.\n')
  console.log(`${findings.length} affected packages at high or critical severity.\n`)
  if (findings.length === 0) {
    console.log('No high or critical vulnerabilities reported.')
  }

  for (const [name, vulnerability] of findings) {
    if (!isRecord(vulnerability)) {
      continue
    }

    console.log(`### ${text(name)} (${text(vulnerability.severity)})\n`)
    console.log(`Affected range: ${text(vulnerability.range)}. ${vulnerability.isDirect ? 'Direct' : 'Transitive'} dependency.\n`)

    if (Array.isArray(vulnerability.via)) {
      for (const advisory of vulnerability.via) {
        if (isRecord(advisory)) {
          console.log(`- ${text(advisory.title)} (${text(advisory.severity)}); advisory: ${text(advisory.url)}`)
        }
        else if (typeof advisory === 'string') {
          console.log(`- Via vulnerable dependency: ${text(advisory)}`)
        }
      }
    }

    const fix = vulnerability.fixAvailable
    if (isRecord(fix)) {
      console.log(`\nSuggested dependency change from npm: ${text(fix.name)}@${text(fix.version)}${fix.isSemVerMajor ? ' (potentially breaking; review compatibility)' : ''}.\n`)
    }
    else {
      console.log(`\n${fix === true ? 'Fix available; review npm audit output before updating.' : 'No fix reported by npm audit.'}\n`)
    }
  }
}
catch (error) {
  console.log('## Dependency audit\n\nAudit results unavailable; check the audit step logs and retry. This is not a clean audit result.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
