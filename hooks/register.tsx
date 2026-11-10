import type { Register } from 'claude-code'

const SESSION_SERVERS = ['ccd_session_mgmt', 'ccd session mgmt']
const SIDEBAR_SERVERS = ['ccd_sidebar', 'ccd sidebar']
const KEY = 'backup-v2'

type Row = { sessionId: string; title: string }
type Group = { id: string; name: string }
type Backup = {
  at: string
  sessions: Record<string, string> // id -> real title
  groups: Record<string, string> // id -> real name
  next: number
  nextGroup: number
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'incognito',
      description: 'Swap session and group names for aliases: on / off / status (no argument toggles; "on" again re-sweeps)',
    })
    if ((await $.store.get(KEY)) || (await $.store.get('backup-v1'))) $.ui.status('incognito ON')
    return next(e)
  })

  on('command.run', { command: 'incognito' }, async ($, e) => {
    const call = async (servers: string[], tool: string, args: Record<string, unknown>) => {
      let last = 'no server answered'
      for (const server of servers) {
        try {
          const r = await $.mcp.call(server, tool, args)
          const text = r.content.map(b => ('text' in b ? String(b.text) : '')).join('')
          if (r.isError) { last = text; continue }
          return text
        } catch (err) {
          last = String(err)
        }
      }
      throw new Error(last)
    }
    const rename = (id: string, title: string) =>
      call(SESSION_SERVERS, 'set_session_title', { session_id: id, title })
    const renameGroup = (id: string, name: string) =>
      call(SIDEBAR_SERVERS, 'rename_group', { group_id: id, name })

    const arg = e.args.trim().toLowerCase()
    let backup = (await $.store.get(KEY)) as Backup | undefined
    if (!backup) {
      // Migrate a v1 backup (sessions only) so already-aliased titles are never lost.
      const old = (await $.store.get('backup-v1')) as { at: string; titles: Record<string, string> } | undefined
      if (old) {
        backup = { at: old.at, sessions: old.titles, groups: {}, next: 100, nextGroup: 1 }
        await $.store.set(KEY, backup)
        await $.store.delete('backup-v1')
      }
    }
    const isOn = backup !== undefined

    if (arg === 'status')
      return { text: isOn ? `Incognito is ON (${Object.keys(backup.sessions).length} sessions, ${Object.keys(backup.groups).length} groups saved).` : 'Incognito is OFF.' }

    // ---- OFF: restore everything, keep failures for retry
    if (isOn && arg !== 'on') {
      const left: Backup = { ...backup, sessions: {}, groups: {} }
      const errors: string[] = []
      let restored = 0
      for (const [id, title] of Object.entries(backup.sessions)) {
        try { await rename(id, title); restored++ }
        catch (err) { left.sessions[id] = title; errors.push(String(err)) }
      }
      for (const [id, name] of Object.entries(backup.groups)) {
        try { await renameGroup(id, name); restored++ }
        catch (err) { left.groups[id] = name; errors.push(String(err)) }
      }
      const failed = Object.keys(left.sessions).length + Object.keys(left.groups).length
      if (failed) {
        await $.store.set(KEY, left)
        return { text: `Restored ${restored}; ${failed} failed (run /incognito off again). First error: ${errors[0]?.slice(0, 200)}` }
      }
      await $.store.delete(KEY)
      $.ui.status(undefined)
      return { text: `Incognito OFF. Restored ${restored} names.` }
    }

    // ---- ON (or re-sweep while ON)
    let rows: Row[]
    let groups: Group[] = []
    try {
      rows = JSON.parse(await call(SESSION_SERVERS, 'list_sessions', { limit: 500, include_archived: true })) as Row[]
    } catch (err) {
      return { text: `Could not list sessions: ${String(err).slice(0, 200)}` }
    }
    try {
      const me = JSON.parse(await call(SESSION_SERVERS, 'get_session', { session_id: 'self' })) as Row
      if (me.sessionId && !rows.some(r => r.sessionId === me.sessionId)) rows.push(me)
    } catch { /* the current chat stays as it is */ }
    let groupNote = ''
    try {
      groups = JSON.parse(await call(SIDEBAR_SERVERS, 'list_groups', {})) as Group[]
    } catch (err) {
      groupNote = ` Groups not listed: ${String(err).slice(0, 120)}`
    }

    backup ??= { at: new Date().toISOString(), sessions: {}, groups: {}, next: 1, nextGroup: 1 }
    const errors: string[] = []
    let n = 0
    let g = 0
    const isAlias = (t: string) => /^Chat \d+$/.test(t) || /^Group \d+$/.test(t)

    // Save real names to disk BEFORE renaming anything.
    for (const r of rows) if (!(r.sessionId in backup.sessions) && !isAlias(r.title)) backup.sessions[r.sessionId] = r.title
    for (const gr of groups) if (!(gr.id in backup.groups) && !isAlias(gr.name)) backup.groups[gr.id] = gr.name
    await $.store.set(KEY, backup)

    for (const r of rows) {
      if (isAlias(r.title) || !(r.sessionId in backup.sessions)) continue
      try { await rename(r.sessionId, `Chat ${backup.next++}`); n++ }
      catch (err) { errors.push(String(err)); delete backup.sessions[r.sessionId] }
    }
    for (const gr of groups) {
      if (isAlias(gr.name) || !(gr.id in backup.groups)) continue
      try { await renameGroup(gr.id, `Group ${backup.nextGroup++}`); g++ }
      catch (err) { errors.push(String(err)); delete backup.groups[gr.id] }
    }
    await $.store.set(KEY, backup)
    $.ui.status('incognito ON')

    const bad = errors.length
    return {
      text: `Incognito ON. Renamed ${n} sessions and ${g} groups.${bad ? ` ${bad} failed; first error: ${errors[0].slice(0, 250)}. Run /incognito on to retry.` : ''}${groupNote}`,
    }
  })
}
