/**
 * Brand marks vendored as white SVG assets.
 * Claude / Cursor / Windsurf / Cline / MCP: simpleicons.org (CC0).
 * OpenAI: Iconify `logos` set (the official mark is not in Simple Icons).
 * Used nominatively to indicate compatibility, not affiliation.
 */
const AGENTS = [
  { name: "Claude", src: "/agents/claude.svg" },
  { name: "OpenAI", src: "/agents/openai.svg" },
  { name: "Cursor", src: "/agents/cursor.svg" },
  { name: "Windsurf", src: "/agents/windsurf.svg" },
  { name: "Cline", src: "/agents/cline.svg" },
  { name: "MCP", src: "/agents/mcp.svg" },
]

export function WorksWithAgents() {
  return (
    <div className="agents">
      <div className="agents-eyebrow">Works with your agents</div>
      <div className="agents-row">
        {AGENTS.map((agent) => (
          <div className="agents-item" key={agent.name} title={agent.name}>
            <img className="agents-icon" src={agent.src} alt="" aria-hidden />
            <span className="agents-label">{agent.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
