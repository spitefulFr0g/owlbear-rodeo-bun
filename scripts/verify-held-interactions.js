// T3 command factory: evaluate this file inside functions.exec, then call run().
(function heldInteractions(tools) {
  const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
  const unwrap = reply => {
    if (reply.isError) throw new Error('T3 preview tool failed');
    if (reply.structuredContent) return reply.structuredContent;
    for (const block of reply.content ?? []) {
      if (block.type === 'text') { try { return JSON.parse(block.text); } catch {} }
    }
    throw new Error('Missing T3 preview result');
  };
  const command = async args => {
    let result = await tools.exec_command({...args, yield_time_ms: 1000, max_output_tokens: 1500});
    let output = result.output ?? '';
    while (result.session_id != null) {
      result = await tools.write_stdin({session_id: result.session_id, chars: '', yield_time_ms: 1000, max_output_tokens: 1500});
      output += result.output ?? '';
    }
    if (result.exit_code !== 0) throw new Error(output || 'Verification command failed');
    return output.trim();
  };
  // Observes actual rendered Konva nodes; gestures are dispatched as DOM mouse events.
  async function page({action, marker, kind, dx = 100, dy = 80}) {
    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wait = async predicate => {
      const end = Date.now() + 10000;
      while (!predicate()) { if (Date.now() > end) throw new Error(`Browser timed out: ${action}`); await settle(); }
    };
    await wait(() => window.Konva?.stages?.length);
    const stage = window.Konva.stages[0];
    const node = () => stage.findOne('#held-check');
    const transformer = () => stage.find('Transformer').find(t => t.nodes().some(n => n.id() === 'held-check'));
    const geometry = () => {
      const n = node(), t = transformer();
      return {position: n?.position() ?? null, scale: n?.scale() ?? null, rotation: n?.rotation() ?? null,
        selected: t?.nodes().map(n => n.id()) ?? [], transforming: t?.isTransforming() ?? false};
    };
    const keyboard = key => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
      document.body.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true}));
    };
    const mouse = (type, point, buttons, target = stage.content) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, button: 0, buttons, clientX: point.x, clientY: point.y,
    }));
    if (action === 'barrier') {
      await wait(() => stage.findOne(`#${marker}`)); await settle(); return geometry();
    }
    if (action === 'read') { await settle(); return geometry(); }
    if (action === 'begin') {
      keyboard('w'); await settle(); await wait(node);
      const n = node(), rect = stage.container().getBoundingClientRect();
      const absolute = n.getAbsoluteTransform().point({x: 50, y: 50});
      let start = {x: rect.x + absolute.x, y: rect.y + absolute.y};
      mouse('mousedown', start, 1); await settle();
      if (kind === 'resize') {
        mouse('mouseup', start, 0); await settle();
        const anchor = transformer()?.findOne('.middle-right');
        if (!anchor) throw new Error('Resize anchor missing');
        const p = anchor.getAbsolutePosition(); start = {x: rect.x + p.x, y: rect.y + p.y};
        mouse('mousedown', start, 1); await settle();
      }
      const scale = n.getParent().getAbsoluteScale();
      const end = {x: start.x + dx * scale.x, y: start.y + dy * scale.y};
      window.__heldVerification = {start, end, kind};
      mouse('mousemove', end, 1, kind === 'resize' ? window : stage.content); await settle(); return geometry();
    }
    const gesture = window.__heldVerification;
    if (!gesture) throw new Error('No held gesture');
    if (action === 'release') mouse('mouseup', gesture.end, 0, gesture.kind === 'resize' ? window : stage.content);
    else if (action === 'tool') keyboard('m');
    else if (action === 'continue') {
      gesture.end = {x: gesture.end.x + 20, y: gesture.end.y + 20};
      mouse('mousemove', gesture.end, 1, gesture.kind === 'resize' ? window : stage.content);
    } else throw new Error(`Unknown browser action: ${action}`);
    await settle(); return geometry();
  }
  const equal = (actual, expected, message) => {
    if (actual === null || expected === null || Object.keys(expected).some(k => typeof expected[k] === 'number'
      ? Math.abs(actual[k] - expected[k]) > 0.001 : actual[k] !== expected[k])) throw new Error(message);
  };
  return {async run({repo, report, onProgress = () => {}}) {
    const configPath = `/tmp/owlbear-held-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
    let config, tabId, startup;
    const results = [];
    const evaluate = async args => unwrap(await tools.mcp__t3_code__preview_evaluate({tabId,
      expression: `(${page.toString()})(${JSON.stringify(args)})`, awaitPromise: true})).value;
    const control = action => command({workdir: repo,
      cmd: `bun backend/scripts/held-interactions-fixture.ts control --config ${quote(configPath)} --action ${quote(action)}`}).then(JSON.parse);
    const barrier = async action => {
      const response = await control(action);
      return {scene: response.scene, rendered: await evaluate({action: 'barrier', marker: response.marker})};
    };
    const savedGeometry = async expected => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await control('state'), item = state.scene.items['held-check'];
        try { equal(item?.position ?? null, expected.position, 'Position not committed');
          equal(item?.scale ?? null, expected.scale, 'Scale not committed'); return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Released geometry did not reach the public scene');
    };
    try {
      const status = unwrap(await tools.mcp__t3_code__preview_status({}));
      const profile = status.profiles?.find(p => p.incognito);
      if (!profile) throw new Error('An isolated incognito T3 preview profile is required');
      onProgress('Starting isolated fixture');
      startup = await tools.exec_command({workdir: `${repo}/backend`, yield_time_ms: 1000, tty: true,
        cmd: `bun scripts/embed-frontend.ts && bun scripts/held-interactions-fixture.ts serve --config ${quote(configPath)}`, max_output_tokens: 700});
      for (let attempt = 0; attempt < 20; attempt++) {
        try { config = JSON.parse(await command({cmd: `cat ${quote(configPath)}`})); break; } catch {
          if (startup.exit_code != null) throw new Error('Fixture failed to start');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      if (!config) throw new Error('Fixture config was not created');
      const opened = unwrap(await tools.mcp__t3_code__preview_open({reuseExistingTab: false, open: false, profileId: profile.id}));
      if (!opened.available || !opened.tabId) throw new Error('T3 collaborative preview unavailable');
      tabId = opened.tabId;
      await tools.mcp__t3_code__preview_navigate({tabId, url: config.address});
      await tools.mcp__t3_code__preview_snapshot({tabId});
      const signin = unwrap(await tools.mcp__t3_code__preview_evaluate({tabId, awaitPromise: true,
        expression: `(async()=>{const r=await fetch('/api/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({username: config.username, password: config.password})})});return r.status})()`})).value;
      if (signin !== 200) throw new Error('Fixture browser sign-in failed');
      await tools.mcp__t3_code__preview_navigate({tabId, url: `${config.address}/game/${config.roomId}`});
      await tools.mcp__t3_code__preview_snapshot({tabId});
      for (const kind of ['move', 'resize']) {
        onProgress(`Checking competing ${kind}`);
        const baseline = (await barrier('reset')).rendered;
        const held = await evaluate({action: 'begin', kind});
        if (JSON.stringify(held.position) === JSON.stringify(baseline.position) && JSON.stringify(held.scale) === JSON.stringify(baseline.scale)) throw new Error(`${kind} gesture did not change geometry`);
        if (kind === 'resize' && !held.transforming) throw new Error('Resize was not held');
        const committed = (await barrier('commit')).rendered;
        equal(committed.position, held.position, `Competing commit cancelled held ${kind}`);
        equal(committed.scale, held.scale, `Competing commit changed held ${kind} scale`);
        if (kind === 'resize' && !committed.transforming) throw new Error('Competing commit stopped resize');
        const continued = await evaluate({action: 'continue'});
        await evaluate({action: 'release'}); await savedGeometry(continued);
        results.push({case: `competing-${kind}`, status: 'pass'});
      }
      for (const kind of ['move', 'resize']) {
        const baseline = (await barrier('reset')).rendered;
        await evaluate({action: 'begin', kind});
        const cancelled = await evaluate({action: 'tool'});
        equal(cancelled.position, baseline.position, `Tool switch left held ${kind} position`);
        equal(cancelled.scale, baseline.scale, `Tool switch left held ${kind} scale`);
        if (cancelled.transforming || cancelled.selected.length) throw new Error('Tool switch left an active transformer');
        await evaluate({action: 'continue'}); await evaluate({action: 'release'}); await savedGeometry(baseline);
        results.push({case: `tool-switch-${kind}`, status: 'pass'});
      }
      await barrier('reset'); await evaluate({action: 'begin', kind: 'move'});
      const deleted = (await barrier('delete')).rendered;
      if (deleted.position || deleted.selected.length || deleted.transforming) throw new Error('Deletion left a held item');
      await evaluate({action: 'continue'}); await evaluate({action: 'release'});
      if ((await control('state')).scene.items['held-check']) throw new Error('Release recreated a deleted item');
      results.push({case: 'deletion', status: 'pass'});
      onProgress('Checking player permission loss');
      const signout = unwrap(await tools.mcp__t3_code__preview_evaluate({tabId, awaitPromise: true,
        expression: `(async()=>{const r=await fetch('/api/sign-out',{method:'POST'});return r.status})()`})).value;
      if (signout !== 204) throw new Error(`Fixture browser sign-out failed: ${signout}`);
      await tools.mcp__t3_code__preview_navigate({tabId, url: `${config.address}/game/${config.roomId}`});
      await tools.mcp__t3_code__preview_snapshot({tabId});
      await barrier('reset');
      const unlocked = (await barrier('player-owner')).rendered;
      const playerHeld = await evaluate({action: 'begin', kind: 'move'});
      if (JSON.stringify(playerHeld.position) === JSON.stringify(unlocked.position)) throw new Error('Player gesture did not start');
      const locked = (await barrier('lock')).rendered;
      equal(locked.position, unlocked.position, 'Permission loss did not restore authoritative position');
      if (locked.selected.length || locked.transforming) throw new Error('Permission loss left an active transformer');
      await evaluate({action: 'continue'}); await evaluate({action: 'release'}); await savedGeometry(unlocked);
      results.push({case: 'permission-loss', status: 'pass'});
      const response = {status: 'pass', cases: results};
      if (report) await command({cmd: `cat > ${quote(report)} <<'HELD_REPORT_JSON'\n${JSON.stringify(response, null, 2)}\nHELD_REPORT_JSON`});
      return response;
    } catch (error) {
      const response = {status: 'fail', cases: results, error: String(error)};
      if (report) await command({cmd: `cat > ${quote(report)} <<'HELD_REPORT_JSON'\n${JSON.stringify(response, null, 2)}\nHELD_REPORT_JSON`});
      return response;
    } finally {
      if (tabId) await tools.mcp__t3_code__t3_preview_close({tabId});
      if (config?.pid) await command({cmd: `kill -TERM ${Number(config.pid)}`});
      else if (startup?.session_id) await tools.write_stdin({session_id: startup.session_id, chars: '\u0003', yield_time_ms: 1000, max_output_tokens: 500});
    }
  }};
})
