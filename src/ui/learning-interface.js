import { phases } from '../data/roadmap.js';
import { createProgressModel } from '../domain/progress.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusNames = { available: 'Доступно', doing: 'В работе', done: 'Пройдено', locked: 'Есть зависимости', failed: 'Перепроверить' };
const names = { atlas: 'Карта зависимостей', session: 'Рабочая сессия', ledger: 'Реестр программы' };
// Each row is a dependency level; parallel branches share a row.
// This changes only presentation, never curriculum IDs/order or prerequisites.
const positions = {p0:[242,20],p1:[22,152],p5:[462,152],p2:[22,284],p7:[242,284],p6:[462,284],p3:[22,416],p8:[242,416],p4:[462,416],p11:[22,548],p9:[242,548],p10:[242,680],p12:[242,812]};
const nodeWidth = 176, nodeHeight = 84;

export function mount(app, { preview = true } = {}) {
  const variant = document.documentElement.dataset.design;
  const model = createProgressModel(app.getState);
  const board = document.getElementById('phaseBoard');
  const roadmap = document.getElementById('roadmap');
  const screens = [...document.querySelector('.content').children].filter(el => el.matches('section[id]'));
  let selected = variant === 'ledger' ? null : model.findNext().id;
  let currentScreen = 'roadmap', step = 'topics', frame, pendingFocus;

  if (preview) {
    const banner = document.createElement('div');
    banner.className = 'preview-banner';
    banner.innerHTML = `<span>${names[variant]} / локальное превью</span><a href="../?designs=4">Сравнить варианты ↗</a>`;
    document.body.prepend(banner);
  } else {
    document.documentElement.classList.add('production-session');
  }

  // All original sections remain reachable. Only their presentation is adapted.
  const topbar = document.querySelector('.topbar');
  const header = document.createElement('header');
  header.className = 'product-header';
  header.innerHTML = `<a class="wordmark" href="#roadmap">java<span>/</span>backend<span class="edition">2026–27</span></a><nav class="primary-navigation" aria-label="Основные разделы"><a href="#roadmap">${variant === 'atlas' ? 'Карта' : variant === 'session' ? 'Занятие' : 'Программа'}</a><a href="#overview">Сегодня</a><a href="#noai">Практика</a><a href="#project">Проект</a><a href="#resources">Материалы</a><a href="#career">Карьера</a></nav>`;
  const menu = document.createElement('details');
  menu.className = 'sections-menu';
  menu.innerHTML = '<summary>Все разделы <span aria-hidden="true">⌄</span></summary>';
  menu.append(document.getElementById('nav'));
  header.append(menu);
  topbar.before(header);
  // Recovery warnings must remain visible when navigating away from the overview.
  const warning = document.getElementById('storageWarning');
  if (warning) topbar.after(warning);
  document.getElementById('drawerBtn').hidden = true;

  const next = document.createElement('div');
  next.className = 'next-work';
  next.innerHTML = '<span class="next-label">Продолжить</span><div><strong></strong><p></p></div><button data-continue>К текущему этапу →</button><span class="local-storage">Сохранение на этом устройстве</span>';
  roadmap.querySelector('.section-head').after(next);

  const tools = document.createElement('details');
  tools.className = 'program-tools';
  tools.innerHTML = '<summary>Фильтры и вид</summary>';
  tools.append(roadmap.querySelector('.board-toolbar'));
  roadmap.querySelector('.section-head').append(tools);
  const title = roadmap.querySelector('.section-head h2');
  title.textContent = names[variant];
  roadmap.querySelector('.section-head p').textContent = variant === 'atlas'
    ? 'Связи показывают условия перехода. SQL и HTTP идут отдельными ветками.'
    : variant === 'session' ? 'Один этап за раз: подготовка, самостоятельная работа, подтверждение результата.'
    : 'Все 13 этапов: состояние, выполненные пункты и подтверждение работы.';

  const layout = document.createElement('div');
  layout.className = 'learning-layout';
  const wrap = document.getElementById('boardWrap');
  wrap.before(layout);
  layout.append(wrap);
  const empty = document.createElement('p');
  empty.className = 'empty-program';
  empty.setAttribute('role','status');
  empty.hidden = true;
  empty.textContent = 'Нет этапов по выбранным фильтрам. Измени статус или категорию.';
  wrap.after(empty);
  let phaseNav, programProgress;
  if (variant === 'atlas') {
    phaseNav = document.createElement('nav');
    phaseNav.className = 'dependency-map';
    phaseNav.id = 'dependencyMap';
    phaseNav.setAttribute('aria-label','Карта этапов и зависимостей');
    layout.prepend(phaseNav);
  } else if (variant === 'session') {
    const rail = document.createElement('aside');
    rail.className = 'session-context';
    rail.innerHTML = '<span class="session-counter"></span><h2>Сейчас в работе</h2><div class="session-next"></div><div class="session-facts"></div><button data-step="practice">Перейти к практике →</button><p>Сначала своя попытка.<br>Затем проверка и объяснение.</p>';
    rail.querySelector('.session-next').append(next);
    const stateDetails = document.createElement('details');
    stateDetails.className = 'session-state-details';
    stateDetails.innerHTML = '<summary>Состояние этапа</summary>';
    const facts = rail.querySelector('.session-facts');
    facts.before(stateDetails);
    stateDetails.append(facts);
    const narrow = matchMedia('(max-width:560px)');
    const resize = () => { stateDetails.open = !narrow.matches; };
    resize();narrow.addEventListener('change',resize);
    layout.prepend(rail);
    phaseNav = document.createElement('nav');
    phaseNav.className = 'session-phases';
    phaseNav.setAttribute('aria-label','Выбор этапа');
    programProgress = document.createElement('div');
    programProgress.className = 'session-program-progress';
    layout.before(programProgress, phaseNav);
  } else {
    const legend = document.createElement('div');
    legend.className = 'ledger-header';
    legend.setAttribute('aria-hidden','true');
    legend.innerHTML = '<span>№</span><span>Этап</span><span>Состояние</span><span>Пункты</span><span>Практика</span><span>Evidence</span><span>Checkpoint</span>';
    wrap.prepend(legend);
  }
  const mobilePicker = document.createElement('select');
  mobilePicker.className = 'mobile-phase-picker';
  mobilePicker.setAttribute('aria-label','Выбрать этап программы');
  mobilePicker.innerHTML = phases.map((p,i)=>`<option value="${p.id}">${String(i).padStart(2,'0')} / ${escape(p.title)}</option>`).join('');
  if (variant === 'atlas') layout.before(mobilePicker);
  if (variant === 'atlas') {
    const toggle = document.createElement('button');
    toggle.className = 'mobile-map-toggle';
    toggle.setAttribute('aria-controls','dependencyMap');
    toggle.setAttribute('aria-expanded','false');
    toggle.textContent = 'Показать карту зависимостей +';
    mobilePicker.after(toggle);
    toggle.addEventListener('click',()=>{
      const open = phaseNav.classList.toggle('map-open');
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent = open ? 'Скрыть карту −' : 'Показать карту зависимостей +';
      if(open) {
        const scroller = phaseNav.querySelector('.map-scroll'), node = phaseNav.querySelector('.map-node.selected');
        scroller.scrollLeft = Math.max(0,node.offsetLeft-(scroller.clientWidth-node.offsetWidth)/2);
        scroller.scrollTop = Math.max(0,node.offsetTop-(scroller.clientHeight-node.offsetHeight)/2);
      }
    });
  }

  function showScreen(id, scroll = true) {
    if (!screens.some(el=>el.id===id)) return;
    currentScreen = id;
    screens.forEach(el=>el.classList.toggle('active-screen',el.id===id));
    document.querySelectorAll('.primary-navigation a,.sections-menu a').forEach(a=>{
      const active = a.hash === '#' + id;
      a.classList.toggle('current-section',active);
      if(active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('.sections-menu[open],.utility-menu[open],.program-tools[open]').forEach(d=>d.open=false);
    document.body.classList.remove('searching');
    if (scroll) window.scrollTo({top:0,behavior:'instant'});
  }
  function choose(id, scroll = false, toggle = false) {
    if (!phases.some(p=>p.id===id)) return;
    selected = selected === id && toggle ? null : id;
    showScreen('roadmap',false);
    sync();
    if (scroll) document.getElementById('phase-'+id)?.scrollIntoView({block:'nearest',behavior:'instant'});
  }
  function group(card) {
    const body = card.querySelector('.phase-body');
    if (body.dataset.adapted) return;
    body.dataset.adapted = 'true';
    const groups = {};
    for (const type of ['topics','practice','proof']) {
      groups[type] = document.createElement('div');
      groups[type].className = 'work-group group-'+type;
      groups[type].dataset.workGroup = type;
    }
    let type = 'topics';
    for(const node of [...body.childNodes]) {
      if(node.nodeType===1 && node.matches('.label-sm') && node.textContent.includes('Проверенная')) type = 'practice';
      if(node.nodeType===1 && node.matches('.checkpoint')) type = 'proof';
      groups[type].append(node);
    }
    body.append(...Object.values(groups));
    card.querySelector('[data-collapse]').setAttribute('aria-label','Свернуть или раскрыть содержимое этапа');
    if (variant === 'session') {
      const progress = document.createElement('div');
      progress.className = 'session-phase-progress';
      card.querySelector('.phase-head').append(progress);
      // Keep both phase bars visible in every work step, including a collapsed phase.
      body.querySelector('.progress-pair')?.remove();
      const tabs = document.createElement('nav');
      tabs.className = 'work-steps';
      tabs.setAttribute('aria-label','Части занятия');
      tabs.innerHTML = [['topics','01','Подготовка'],['practice','02','Практика'],['proof','03','Результат']].map(([id,num,label])=>`<button data-step="${id}" aria-controls="${card.id}-${id}"><span>${num}</span>${label}</button>`).join('');
      body.before(tabs);
      for(const [type,group] of Object.entries(groups)) group.id = card.id+'-'+type;
    }
    if(variant === 'ledger') {
      const row = document.createElement('div');
      row.className = 'ledger-row';
      card.prepend(row);
    }
  }
  function renderMap() {
    const oldScroll = phaseNav.querySelector('.map-scroll');
    const scroll = {left:oldScroll?.scrollLeft||0,top:oldScroll?.scrollTop||0};
    let longEdge = 0;
    const paths = phases.flatMap(p=>p.deps.map(dep=>{
      const [x,y] = positions[dep], [tx,ty] = positions[p.id];
      const adjacent = ty-y === 132;
      // Route long edges around intermediate nodes so they never imply a false prerequisite.
      const lane = x + nodeWidth + 12 + (adjacent ? 0 : longEdge++ % 4 * 6);
      const start = y + nodeHeight, end = ty - 3;
      const path = adjacent
        ? `M${x+nodeWidth/2} ${start} C${x+nodeWidth/2} ${(start+end)/2} ${tx+nodeWidth/2} ${(start+end)/2} ${tx+nodeWidth/2} ${end}`
        : `M${x+nodeWidth/2} ${start} V${start+14} H${lane} V${ty-18-p.deps.indexOf(dep)*7} H${tx+nodeWidth/2} V${end}`;
      const active = selected===p.id || selected===dep;
      return `<path class="dependency-edge ${active?'selected-edge':''}" data-from="${dep}" data-to="${p.id}" marker-end="url(#${active?'map-arrow-selected':'map-arrow'})" d="${path}" />`;
    })).join('');
    phaseNav.innerHTML = `<div class="map-legend"><span><i></i>Доступно</span><span><i class="legend-locked"></i>Нужен checkpoint</span><span>Порядок: сверху вниз ↓</span></div><div class="map-scroll"><div class="map-canvas"><svg viewBox="0 0 660 916" aria-hidden="true"><defs><marker id="map-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 Z" fill="var(--muted)" /></marker><marker id="map-arrow-selected" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 Z" fill="var(--blue)" /></marker></defs>${paths}</svg>${phases.map((p,i)=>{
      const [x,y]=positions[p.id],status=model.phaseStatusEffective(p),card=document.getElementById('phase-'+p.id);
      return `<button title="${escape(p.deps.length?'После checkpoint: '+p.deps.map(id=>phases.find(p=>p.id===id).title).join(', '):'Начало программы')}" style="left:${x}px;top:${y}px" data-open-phase="${p.id}" class="map-node ${status} ${selected===p.id?'selected':''} ${card.classList.contains('hidden')?'filtered':''}" ${card.classList.contains('hidden')?'disabled':''} ${selected===p.id?'aria-current="step"':''}><span class="node-number">${String(i).padStart(2,'0')}</span><span>${escape(p.title)}<small>${statusNames[status]}</small></span></button>`;
    }).join('')}</div></div><p class="map-note">Стрелка ведёт от обязательного checkpoint к следующему этапу. Рядом расположены параллельные ветки; выделены связи выбранного этапа.</p>`;
    const scroller = phaseNav.querySelector('.map-scroll');
    scroller.scrollLeft = scroll.left;scroller.scrollTop = scroll.top;
  }
  const observer = new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);});
  function sync() {
    observer.disconnect();
    const focusedPhase = document.activeElement?.matches('.map-node,.session-phases button') ? document.activeElement.dataset.openPhase : null;
    const visible = [...board.children].filter(card=>!card.classList.contains('hidden'));
    empty.hidden = visible.length > 0;
    if(variant !== 'ledger' && visible.length && document.getElementById('phase-'+selected)?.classList.contains('hidden')) selected = visible[0].id.replace('phase-','');
    for(const card of board.children) {
      if(!card.matches('.phase')) continue;
      group(card);
      const id = card.id.replace('phase-',''), p = phases.find(p=>p.id===id), active = id===selected;
      card.classList.toggle('selected-phase',active);
      card.dataset.step = step;
      card.querySelectorAll('[data-step]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.step===step)));
      const row = card.querySelector('.ledger-row');
      if(row) {
        const status=model.phaseStatusEffective(p), st=app.getState();
        row.innerHTML = `<span class="row-number">${id.slice(1).padStart(2,'0')}</span><button data-open-phase="${id}" aria-expanded="${active}" class="row-title">${escape(p.title)}<small>${p.cat} · ${model.hoursForPhase(p)} ч</small></button><span class="row-status ${status}">${statusNames[status]}</span><span class="row-count row-knowledge"><small>Пункты</small>${Math.round(model.phaseKnowledge(p)*p.topics.length)} / ${p.topics.length}</span><span class="row-count row-practice"><small>Практика</small>${Math.round(model.phasePractice(p)*p.practice.length)} / ${p.practice.length}</span><span class="row-evidence ${st.evidence[id]?.trim()?'recorded':''}">${st.evidence[id]?.trim()?'Записано':'Нет записи'}</span><button data-open-phase="${id}" aria-expanded="${active}" class="row-open">${model.checkpointValid(id)?'Пройден ✓':active?'Закрыть −':'Открыть +'}</button>`;
      }
    }
    next.querySelector('strong').textContent = document.getElementById('nextAction').textContent;
    next.querySelector('p').textContent = document.getElementById('nextDesc').textContent;
    if(variant === 'atlas') renderMap();
    if(variant === 'session') {
      const completed = phases.filter(p=>model.checkpointValid(p.id)).length;
      programProgress.innerHTML = `<div class="program-progress-label"><span>Прогресс программы</span><strong>${model.overallProgress()}%</strong><span>${completed} из ${phases.length} этапов · по пройденным checkpoint</span></div><progress aria-label="Пройденные этапы программы" max="${phases.length}" value="${completed}"></progress>`;
      phaseNav.innerHTML = phases.map((p,i)=>`<button data-open-phase="${p.id}" title="${escape(p.title)}" aria-label="Этап ${i}: ${escape(p.title)}" class="${selected===p.id?'selected':''}" ${selected===p.id?'aria-current="step"':''}><span>${String(i).padStart(2,'0')}</span><span>${escape(p.title)}</span></button>`).join('');
      const p = phases.find(p=>p.id===selected);
      const knowledge = Math.round(model.phaseKnowledge(p)*p.topics.length), practice = Math.round(model.phasePractice(p)*p.practice.length);
      document.querySelector('#phase-'+p.id+' .session-phase-progress').innerHTML = [[p.id==='p0'?'Подготовка':p.id==='p11'||p.id==='p12'?'Действия':'Освоение',knowledge,p.topics.length],['Практика',practice,p.practice.length]].map(([label,value,total])=>`<div><div class="phase-progress-label"><span>${label}</span><strong>${value} / ${total} · ${Math.round(value/total*100)}%</strong></div><progress aria-label="${label}: ${escape(p.title)}" max="${total}" value="${value}"></progress></div>`).join('');
      document.querySelector('.session-counter').textContent = `Этап ${phases.indexOf(p)+1} из 13`;
      document.querySelector('.session-facts').innerHTML = `<dl><div><dt>Пункты</dt><dd>${Math.round(model.phaseKnowledge(p)*p.topics.length)} / ${p.topics.length}</dd></div><div><dt>Практика</dt><dd>${Math.round(model.phasePractice(p)*p.practice.length)} / ${p.practice.length}</dd></div><div><dt>Checkpoint</dt><dd>${model.checkpointValid(p.id)?'Пройден':'Не пройден'}</dd></div></dl><div class="session-deps"><span>Перед этим этапом</span>${p.deps.length?p.deps.map(id=>`<button data-open-phase="${id}">${escape(phases.find(p=>p.id===id).title)} ↗</button>`).join(''):'<p>Предыдущих этапов нет</p>'}</div>`;
    }
    if(selected) mobilePicker.value = selected;
    if(focusedPhase) phaseNav?.querySelector(`[data-open-phase="${focusedPhase}"]`)?.focus({preventScroll:true});
    if(pendingFocus) { document.querySelector(pendingFocus)?.focus({preventScroll:true});pendingFocus=null; }
    observer.observe(board,{childList:true});
  }
  document.addEventListener('click',e=>{
    const opener=e.target.closest('[data-open-phase]');
    if(opener){choose(opener.dataset.openPhase,false,variant==='ledger');return;}
    const tab=e.target.closest('[data-step]');
    if(tab){step=tab.dataset.step;sync();return;}
    if(e.target.closest('[data-continue]')) {
      document.getElementById('nextActionBtn').click();
      return;
    }
    const link=e.target.closest('a[href^="#"]');
    if(link&&screens.some(s=>link.hash==='#'+s.id)) {e.preventDefault();history.replaceState(null,'',link.hash);showScreen(link.hash.slice(1));}
    if(e.target.closest('.utility-items .btn')) document.querySelector('.utility-menu').open=false;
  });
  document.addEventListener('change',e=>{
    if(!board.contains(e.target))return;
    for(const name of ['mastery','setup','practice']) if(e.target.dataset[name]) pendingFocus=`[data-${name}="${CSS.escape(e.target.dataset[name])}"]`;
  },true);
  mobilePicker.addEventListener('change',()=>choose(mobilePicker.value));
  document.getElementById('searchInput').addEventListener('input',e=>document.body.classList.toggle('searching',!!e.target.value.trim()));
  for(const id of ['statusFilter','categoryFilter']) document.getElementById(id).addEventListener('change',()=>requestAnimationFrame(sync));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')document.querySelectorAll('.sections-menu[open],.utility-menu[open],.program-tools[open]').forEach(d=>{
      const restore = d.contains(document.activeElement);
      d.open=false;
      if(restore)d.querySelector('summary').focus();
    });
  });
  window.addEventListener('roadmap:current',e=>{step='topics';choose(e.detail.id);});
  window.addEventListener('roadmap:saved',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);});
  const initial = location.hash.slice(1);
  showScreen(screens.some(s=>s.id===initial)?initial:'roadmap',false);
  sync();
}
