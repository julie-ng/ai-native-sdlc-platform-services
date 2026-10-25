import { readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)))
const files = ['AGENTS.md', 'README.md']
const failures: string[] = []

async function collectMarkdown (directory: string) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      await collectMarkdown(path)
    }
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path)
    }
  }
}

// Explicit roots keep local clones, build output, and personal adapters out of this check.
for (const directory of ['docs', 'app', 'server', 'shared', '.agents/skills']) {
  await collectMarkdown(directory)
}

for (const file of files) {
  const markdown = await readFile(resolve(root, file), 'utf8')
  const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')

  // Repository docs use inline Markdown links. Check file targets, not network URLs or anchors.
  for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const target = match[1]
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) {
      continue
    }
    const path = decodeURIComponent(target.split(/[?#]/)[0])
    try {
      const resolvedTarget = await realpath(resolve(root, dirname(file), path))
      const relativeTarget = relative(root, resolvedTarget)
      if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
        failures.push(`${file}: local link leaves this repository: ${target}`)
      }
    }
    catch {
      failures.push(`${file}: missing local link target ${target}`)
    }
  }

  if (file.endsWith('/SKILL.md')) {
    const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/)
    const name = frontmatter?.[1].match(/^name: ([a-z\d]+(?:-[a-z\d]+)*)$/m)?.[1]
    const description = frontmatter?.[1].match(/^description: (.+)$/m)?.[1]
    const fields = frontmatter?.[1].split('\n').filter(Boolean) ?? []
    if (!name || name !== dirname(file).split('/').at(-1) || !description || fields.length !== 2) {
      failures.push(`${file}: use portable, single-line name and description metadata matching the skill folder`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`Checked local file links and skill metadata in ${files.length} Markdown files.`)
}
