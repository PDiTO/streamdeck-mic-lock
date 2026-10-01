// Property inspector: the plugin owns all settings; this page only sends edits and renders what it gets back.
let socket, uuid, action, latest = null;
const send = payload => socket?.readyState === 1 && socket.send(JSON.stringify({ event: 'sendToPlugin', context: uuid, action, payload }));
const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

window.connectElgatoStreamDeckSocket = (port, inUUID, registerEvent, info, actionInfo) => {
  uuid = inUUID;
  action = JSON.parse(actionInfo).action;
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => { socket.send(JSON.stringify({ event: registerEvent, uuid })); send({ type: 'devices' }); };
  socket.onmessage = ev => {
    const message = JSON.parse(ev.data);
    if (message.event === 'sendToPropertyInspector' && message.payload?.type === 'devices') { latest = message.payload; render(); }
  };
};

for (const name of ['enabled', 'strict']) $(name).addEventListener('change', e => send({ type: 'option', name, value: e.target.checked }));

function render() {
  // Don't rebuild under the cursor while someone is typing a label.
  if (document.activeElement?.matches?.('#devices input[type=text]')) return;
  const state = latest;
  if (!state.ready) { $('status').textContent = state.helperOk ? 'Reading audio devices…' : 'The audio helper is not running.'; $('devices').innerHTML = ''; return; }
  $('status').textContent = '';
  $('enabled').checked = state.enabled;
  $('strict').checked = state.strict;
  $('strict').disabled = !state.enabled;
  $('devices').innerHTML = state.devices.map(d => `
    <div class="device ${d.connected ? '' : 'offline'}" data-uid="${esc(d.uid)}">
      <header>
        <span class="dot ${d.current ? 'current' : d.connected ? 'on' : ''}"></span>
        <b title="${esc(d.name)}">${esc(d.name)}</b>
        <span class="tag">${d.current ? 'in use' : d.connected ? '' : 'not connected'}</span>
      </header>
      <div class="toggles">
        <label><input type="radio" name="home" data-field="home" ${state.home === d.uid ? 'checked' : ''}> Home mic</label>
        <label><input type="checkbox" data-field="cycle" ${d.skip ? '' : 'checked'}> In cycle</label>
        ${d.connected ? '' : '<button data-field="forget">Forget</button>'}
      </div>
      <div class="row"><span>Icon</span><select data-field="kind">
        <option value="">Auto (${esc(state.kinds[d.auto] || d.auto)})</option>
        ${Object.entries(state.kinds).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select></div>
      <div class="row"><span>Label</span><input type="text" data-field="label" maxlength="24" placeholder="${esc(d.autoLabel)}" value="${esc(d.label || '')}"></div>
    </div>`).join('');
}

$('devices').addEventListener('change', e => {
  const uid = e.target.closest('.device')?.dataset.uid;
  const field = e.target.dataset.field;
  if (!uid || !field) return;
  if (field === 'home') send({ type: 'home', uid });
  if (field === 'cycle') send({ type: 'device', uid, skip: !e.target.checked });
  if (field === 'kind') send({ type: 'device', uid, kind: e.target.value });
  if (field === 'label') send({ type: 'device', uid, label: e.target.value.trim() });
});
$('devices').addEventListener('click', e => {
  if (e.target.dataset.field !== 'forget') return;
  send({ type: 'forget', uid: e.target.closest('.device').dataset.uid });
});
$('devices').addEventListener('focusout', () => setTimeout(() => latest && render(), 0));
