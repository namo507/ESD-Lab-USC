// REDCap sync status.
function ScreenRedcap() {
  const ev = window.REDCAP_EVENTS;
  const okN = ev.filter(e => e.status === 'ok').length;
  const warnN = ev.filter(e => e.status === 'warn').length;
  const failN = ev.filter(e => e.status === 'fail').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>REDCap sync</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 32, fontWeight: 600, marginTop: 4, lineHeight: 1.05 }}>
            <Gloss term="RedCap">REDCap</Gloss> · forms &amp; metadata
          </div>
          <div style={{ color: C.s500, fontSize: 13, marginTop: 6, fontFamily: "'Source Serif 4', serif", maxWidth: 620 }}>
            Bidirectional sync with the NANO REDCap project. Pulls visit metadata, pushes processed flags. PHI columns are stripped before any export.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" icon="key">Rotate token</Button>
          <Button icon="refresh-cw">Sync now</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPI label="Forms tracked" value="14" sub="versioned · v1–v4" />
        <KPI label="Records · 24 h" value="25" sub="pulled and pushed" delta={`+${okN}`} deltaKind="up" />
        <KPI label="Warnings" value={warnN} sub="missing fields · review" delta="needs eye" deltaKind="flat" />
        <KPI label="Failures" value={failN} sub="auto-retry queued" delta={failN ? 'needs auth' : 'clear'} deltaKind={failN ? 'down' : 'up'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <Card pad={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}` }}>
            <SectionLabel>Sync events · last 1 h</SectionLabel>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Time', 'Form', 'n', 'Status', 'Note'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, color: C.s500, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${C.s300}`, background: C.paper }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ev.map((e, i) => (
                <tr key={i}>
                  <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", color: C.s500 }}>{e.ts}</td>
                  <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", color: C.ink }}>{e.form}</td>
                  <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{e.n}</td>
                  <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.s100}` }}>
                    <Badge kind={e.status === 'ok' ? 'ok' : e.status === 'warn' ? 'warn' : 'fail'} size="sm">{e.status}</Badge>
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.s100}`, color: C.s700 }}>{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card pad={20}>
          <SectionLabel>Field map · medical_history_v1</SectionLabel>
          <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
            {[
              { k: 'study_id',    v: 'NANO-XXXX',     phi: false },
              { k: 'dob',         v: 'YYYY-MM-DD',    phi: true },
              { k: 'sex',         v: 'M | F | X',     phi: false },
              { k: 'cga_wks',     v: 'float',         phi: false },
              { k: 'mrn',         v: 'string',        phi: true },
              { k: 'caregiver_id',v: 'NANO-CG-XXXX',  phi: false },
              { k: 'site',        v: 'enum',          phi: false },
            ].map(f => (
              <div key={f.k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, padding: '4px 0', borderBottom: `1px solid ${C.s100}` }}>
                <span style={{ color: C.ink }}>{f.k}</span>
                <span style={{ color: C.s500 }}>{f.v}</span>
                {f.phi ? <Badge kind="phi" size="sm">PHI · stripped</Badge> : <Badge kind="ok" size="sm">ok</Badge>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.s200}`, fontSize: 12, color: C.s700, lineHeight: 1.5 }}>
            PHI fields never leave the secure REDCap proxy — only hashed/derived columns are written to <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>processed/deidentified/</code>.
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenRedcap });
