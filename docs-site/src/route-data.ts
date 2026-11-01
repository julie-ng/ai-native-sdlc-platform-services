// Reshapes the generated sidebar into a flat, scannable list.
// - HTTP API: operations directly under the section, without starlight-openapi's "Operations" group.
// - Code reference: one group per source folder; each module is followed by its exported members,
//   like a classic JSDoc index. TypeDoc's module router renders a module and its members on one page.
// https://starlight.astro.build/guides/route-data/
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data'
import { getCollection } from 'astro:content'

type SidebarEntry = StarlightRouteData['sidebar'][number]
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>
type SidebarGroup = Extract<SidebarEntry, { type: 'group' }>

interface Member {
  name: string
  kind: string
}

// Labels of the top-level groups configured in astro.config.mjs.
const httpApiLabel = 'HTTP API'
const codeReferenceLabel = 'Code reference'

// TypeDoc section headings (`## Functions`) and the short kind shown next to each member.
// References (re-exports) are left out; the target module lists them.
const memberKinds: Record<string, string> = {
  'Classes': 'class',
  'Enumerations': 'enum',
  'Functions': 'fn',
  'Interfaces': 'intf',
  'Type Aliases': 'type',
  'Variables': 'var',
}

let membersByTitle: Promise<Map<string, Member[]>> | undefined

export const onRequest = defineRouteMiddleware(async (context, next) => {
  // starlight-openapi builds its sidebar group in a later ('post') middleware; reshape afterwards.
  await next()
  const route = context.locals.starlightRoute
  membersByTitle ??= loadMembers()
  const members = await membersByTitle
  route.sidebar = route.sidebar.map((entry) => {
    if (entry.type !== 'group') {
      return entry
    }
    if (entry.label === httpApiLabel) {
      return { ...entry, entries: entry.entries.flatMap(child => child.type === 'group' ? child.entries : [child]) }
    }
    if (entry.label === codeReferenceLabel) {
      return { ...entry, entries: groupModulesByFolder(collectLinks(entry.entries), members) }
    }
    return entry
  })
})

/** Members of every generated module page, keyed by page title (the TypeDoc module name). */
async function loadMembers() {
  const entries = await getCollection('docs', entry => entry.id.startsWith('code/'))
  return new Map(entries.map(entry => [entry.data.title, parseMembers(entry.body ?? '')]))
}

/** Members are the `###` headings under TypeDoc's `##` kind sections. */
function parseMembers(markdown: string) {
  const members: Member[] = []
  let kind: string | undefined
  for (const line of markdown.split('\n')) {
    const section = /^## (.+)$/.exec(line)
    if (section) {
      kind = memberKinds[section[1]!]
      continue
    }
    const heading = /^### (.+)$/.exec(line)
    if (heading && kind) {
      members.push({ name: heading[1]!.replace(/\(\)$/, ''), kind })
    }
  }
  return members
}

function collectLinks(entries: SidebarEntry[]): SidebarLink[] {
  return entries.flatMap(entry => entry.type === 'link' ? [entry] : collectLinks(entry.entries))
}

/**
 * Module titles are paths relative to `server/`: `db/schema`, `utils/use-logger`,
 * `utils/artifact/service.utils`. The folder is the last directory, the label the file name.
 */
function groupModulesByFolder(links: SidebarLink[], membersByTitle: Map<string, Member[]>) {
  const overview: SidebarEntry[] = []
  const folders = new Map<string, SidebarGroup>()
  for (const link of links) {
    const segments = link.label.split('/')
    if (segments.length < 2) {
      // The TypeDoc project index, titled after the package name.
      overview.push({ ...link, label: 'Overview' })
      continue
    }
    const folder = segments.at(-2)!
    const group = folders.get(folder) ?? { type: 'group', label: folder, entries: [], collapsed: false, badge: undefined }
    folders.set(folder, group)
    group.entries.push(
      { ...link, label: segments.at(-1)!, attrs: { ...link.attrs, 'data-sidebar-kind': 'module' } },
      ...(membersByTitle.get(link.label) ?? []).map(member => memberLink(link.href, member)),
    )
  }
  return [...overview, ...folders.values()]
}

function memberLink(moduleHref: string, { name, kind }: Member): SidebarLink {
  return {
    type: 'link',
    label: name,
    // Starlight slugs headings with github-slugger; member names are identifiers, so lower-casing matches.
    href: `${moduleHref}#${name.toLowerCase()}`,
    isCurrent: false,
    badge: { text: kind, variant: 'default' },
    attrs: { 'data-sidebar-kind': 'member' },
  }
}
