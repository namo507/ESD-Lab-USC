// Participants list — filterable, searchable; click a row to open detail.
const { useState: useStateP2, useMemo: useMemoP2 } = React;

function ScreenParticipants({ query, setQuery, onOpenParticipant }) {
  const [groupF, setGroupF] = useStateP2('all');
  const [qaF, setQaF] = useStateP2('all');
  const [visitF, setVisitF] = useStateP2('all');
  const [sort, setSort] = useStateP2({ key: 'updated', dir: 'desc' });

  const rows = useMemoP2(() => {
    let r = window.PARTICIPANTS.slice();
    const q = (query || '').toLowerCase();
    if (q) r = r.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.group.toLowerCase().includes(q) ||
      p.visit.toLowerCase().includes(q) ||
      (p.hda || '').toLowerCase().includes(q)
    );
    if (groupF !== 'all') r = r.filter(p => p.group === groupF);
    if (qaF !== 'all')    r = r.filter(p => p.qa === qaF);
    if (visitF !== 'all') r = r.filter(p => p.visit === visitF);
    return r;
  }, [query, groupF, qaF, visitF]);

  const grpColor = { VPT: C.garnet, ASIB: C.purple, TD: C.s500 };
  const grpKind = { VPT: 'vpt', ASIB: 'asib', TD: 'td' };

  const counts = {
    VPT: window.PARTICIPANTS.filter(p => p.group === 'VPT').length,
    ASIB: window.PARTICIPANTS.filter(p => p.group === 'ASIB').length,
    TD: window.PARTICIPANTS.filter(p => p.group === 'TD').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s400, letterSpacing: '.08em', textTransform: 'uppercase' }}>Participants</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.015em', marginTop: 4 }}>
            {rows.length} <span style={{ color: C.s400 }}>of {window.PARTICIPANTS.length}</span>
          </div>
          <div style={{ fontSize: 13, color: C.s500, marginTop: 4 }}>
            <Gloss term="VPT">VPT</Gloss> {counts.VPT} · <Gloss term="ASIB">ASIB</Gloss> {counts.ASIB} · <Gloss term="TD">TD</Gloss> {counts.TD}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" icon="filter">Saved filters</Button>
          <Button variant="secondary" icon="download">Export · CSV</Button>
          <Button icon="user-plus">Add visit</Button>
        </div>
      </div>

      <Card pad={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${C.s200}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Group</span>
            <Segmented size="sm" options={[{value:'all',label:'all'},{value:'VPT',label:'VPT'},{value:'ASIB',label:'ASIB'},{value:'TD',label:'TD'}]}
              value={groupF} onChange={setGroupF} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>QA</span>
            <Segmented size="sm" options={[{value:'all',label:'all'},{value:'pass',label:'pass'},{value:'pending',label:'pending'},{value:'reject',label:'reject'}]}
              value={qaF} onChange={setQaF} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.s500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Visit</span>
            <select value={visitF} onChange={e => setVisitF(e.target.value)}
              style={{ font: 'inherit', fontSize: 12, padding: '4px 6px', border: `1px solid ${C.s300}`, borderRadius: 2, background: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
              <option value="all">all</option>
              {window.VISITS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>{rows.length} rows</div>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {[
                  {k:'id', l:'Participant'},
                  {k:'group', l:'Group'},
                  {k:'cga_wks', l:<Gloss term="CGA">CGA</Gloss>},
                  {k:'sex', l:'Sex'},
                  {k:'visit', l:'Visit'},
                  {k:'windows', l:<Gloss term="Window">Windows</Gloss>},
                  {k:'qa', l:<Gloss term="SQI">QA</Gloss>},
                  {k:'rmssd', l:<Gloss term="RMSSD">RMSSD</Gloss>},
                  {k:'hf', l:<Gloss term="HF">HF</Gloss>},
                  {k:'hda', l:<Gloss term="HDA">HDA</Gloss>},
                  {k:'updated', l:'Updated'},
                ].map(h => (
                  <th key={h.k} style={{
                    textAlign: 'left', padding: '10px 14px',
                    fontSize: 10, fontWeight: 700, color: C.s500,
                    textTransform: 'uppercase', letterSpacing: '.08em',
                    borderBottom: `1px solid ${C.s300}`,
                    background: C.paper, position: 'sticky', top: 0,
                    cursor: 'pointer', userSelect: 'none',
                  }} onClick={() => setSort({ key: h.k, dir: sort.key === h.k && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {h.l}
                      {sort.key === h.k && <Icon name={sort.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={10} color={C.s500} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} onClick={() => onOpenParticipant(r.id)}
                  onMouseEnter={e => e.currentTarget.style.background = C.s50}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ cursor: 'pointer', transition: 'background 80ms' }}>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.ink, fontWeight: 600 }}>{r.id}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}` }}>
                    <Badge kind={grpKind[r.group]} size="sm">{r.group}</Badge>
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{r.cga_wks.toFixed(1)} <span style={{ color: C.s400 }}>wks</span></td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, color: C.s500 }}>{r.sex}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.s700 }}>{r.visit}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace" }}>{r.windows}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}` }}>
                    <Badge kind={r.qa === 'pass' ? 'ok' : r.qa === 'reject' ? 'fail' : 'pending'} size="sm">{r.qa}</Badge>
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace" }}>{r.rmssd != null ? r.rmssd.toFixed(2) : <span style={{color:C.s400}}>—</span>}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace", color: C.s700 }}>{r.hf != null ? r.hf.toFixed(1) : <span style={{color:C.s400}}>—</span>}</td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}` }}>
                    {r.hda ? <Tooltip gloss={r.hda.charAt(0).toUpperCase() + r.hda.slice(1)} maxWidth={300}><span style={{ fontSize: 11, color: C.s700, borderBottom: `1px dotted ${C.s400}`, cursor: 'help' }}>{r.hda}</span></Tooltip> : <span style={{ color: C.s400 }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: `1px solid ${C.s100}`, color: C.s500, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{r.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.s200}`, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.s500, fontFamily: "'JetBrains Mono', monospace" }}>
          <span>showing {rows.length} of {window.PARTICIPANTS.length}</span>
          <span>updated 2 min ago · auto every 60 s</span>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { ScreenParticipants });
