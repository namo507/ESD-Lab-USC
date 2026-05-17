// Root app — wires everything together with simple route state + Tweaks.
const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "pipelineStyle": "dag",
  "showHipaaBanner": true,
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [route, setRoute] = useStateApp({ name: 'overview' });
  const [query, setQuery] = useStateApp('');
  const [showHipaa, setShowHipaa] = useStateApp(true);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULS);

  refreshIcons();
  useEffectApp(() => { if (window.lucide) window.lucide.createIcons(); }, [route, tweaks]);

  const study = { enrolled: 231, target: 260 };

  function openParticipant(id) { setRoute({ name: 'detail', id }); }
  function openQA(id) { setRoute({ name: 'qa', id }); }

  let body;
  switch (route.name) {
    case 'overview':
      body = <ScreenOverview pipelineStyle={tweaks.pipelineStyle} setRoute={setRoute} study={study} />;
      break;
    case 'participants':
      body = <ScreenParticipants query={query} setQuery={setQuery} onOpenParticipant={openParticipant} />;
      break;
    case 'detail':
      body = <ScreenParticipantDetail id={route.id} onBack={() => setRoute({ name: 'participants' })} onOpenQA={openQA} />;
      break;
    case 'qa':
      body = <ScreenQA participantId={route.id || 'NANO-0102'} />;
      break;
    case 'results':
      body = <ScreenResults />;
      break;
    case 'runs':
      body = <ScreenRuns />;
      break;
    case 'redcap':
      body = <ScreenRedcap />;
      break;
    default:
      body = <ScreenOverview pipelineStyle={tweaks.pipelineStyle} setRoute={setRoute} study={study} />;
  }

  const navRoute = route.name === 'detail' ? { name: 'participants' } : route;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.paper }}>
      <TopNav user="JB" route={navRoute} setRoute={setRoute} query={query} onSearch={setQuery} runStatus="running" />
      {tweaks.showHipaaBanner && showHipaa && <HipaaBanner onDismiss={() => setShowHipaa(false)} />}
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar route={navRoute} setRoute={setRoute} study={study} />
        <main style={{ flex: 1, padding: tweaks.density === 'compact' ? '20px 24px' : '28px 32px', minWidth: 0, maxWidth: 1400 }}>
          {body}
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.s200}`, fontSize: 11, color: C.s400, fontFamily: "'JetBrains Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
            <span>Early Social Development Lab · University of South Carolina</span>
            <span>NIH R01 MH123456 · IRB Pro00115234 · v0.14.2</span>
          </div>
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Pipeline visualization">
          <TweakRadio
            label="Style"
            value={tweaks.pipelineStyle}
            options={[
              { value: 'dag', label: 'DAG' },
              { value: 'sankey', label: 'Sankey' },
              { value: 'kanban', label: 'Kanban' },
            ]}
            onChange={v => setTweak('pipelineStyle', v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Density"
            value={tweaks.density}
            options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
            onChange={v => setTweak('density', v)}
          />
          <TweakToggle
            label="HIPAA banner"
            value={tweaks.showHipaaBanner}
            onChange={v => setTweak('showHipaaBanner', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
