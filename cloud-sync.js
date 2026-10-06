(() => {
  'use strict';
  const PREFIX='javaRoadmapCloud:', LOCAL_FIELDS=['theme','focus','zoom','phaseCollapsed','lastSavedAt'];
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  function equal(a,b){if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]))}return false}
  function merge(base,local,remote,choose='local',path='',conflicts=[]){
    if(equal(local,remote))return copy(local);
    if(equal(base,local))return copy(remote);
    if(equal(base,remote))return copy(local);
    if(object(local)&&object(remote)&&(object(base)||base===undefined)){
      const out={};for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
        if(['__proto__','constructor','prototype'].includes(key))continue;
        const value=merge(base?.[key],local[key],remote[key],choose,path?path+'.'+key:key,conflicts);if(value!==undefined)out[key]=value;
      }return out;
    }
    conflicts.push(path);return copy(choose==='remote'?remote:local);
  }
  function progress(value){const out=copy(value);for(const field of LOCAL_FIELDS)delete out[field];return out}
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(PREFIX+key))||fallback}catch{return fallback}};
  const store=(key,value)=>localStorage.setItem(PREFIX+key,JSON.stringify(value));
  let config=window.ROADMAP_CLOUD_CONFIG?.url?window.ROADMAP_CLOUD_CONFIG:read('config',{});
  let session=null,meta=null,busy=false,again=false,applying=false,pending=null,debounce=null,epoch=0;
  const button=document.createElement('button');button.id='cloudBtn';button.className='btn';button.textContent='Облако';document.querySelector('.top-actions').append(button);
  const style=document.createElement('style');style.textContent='#cloudDialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:14px;width:min(560px,calc(100vw - 24px));max-height:90vh;padding:20px;overflow:auto}#cloudDialog::backdrop{background:#000a}#cloudDialog label{display:block;margin:12px 0 4px}#cloudDialog input{width:100%;box-sizing:border-box;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:10px;border-radius:8px}#cloudDialog button{margin:8px 6px 0 0}#cloudDialog p{overflow-wrap:anywhere}#cloudStatus{white-space:pre-wrap}';document.head.append(style);
  const dialog=document.createElement('dialog');dialog.id='cloudDialog';dialog.setAttribute('aria-labelledby','cloudTitle');dialog.innerHTML=`<h2 id="cloudTitle">Прогресс на всех устройствах</h2><p id="cloudStatus" role="status" aria-live="polite"></p><p class="muted">Отметки, checkpoint и записи синхронизируются. Тема и масштаб остаются на этом устройстве. Локальные изменения доступны и без интернета.</p><div id="cloudLogin"><label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"><button id="cloudSend" class="btn primary">Прислать ссылку / код</button><label for="cloudCode">Код из письма, если указан</label><input id="cloudCode" inputmode="numeric" autocomplete="one-time-code"><button id="cloudVerify" class="btn">Войти по коду</button></div><div id="cloudSigned" hidden><p id="cloudAccount"></p><button id="cloudNow" class="btn primary">Синхронизировать сейчас</button><button id="cloudLogout" class="btn">Выйти</button></div><div id="cloudConflict" hidden><p id="cloudConflictText"></p><button id="cloudUseLocal" class="btn">Оставить мои изменения</button><button id="cloudUseRemote" class="btn">Взять из облака</button></div><details id="cloudSetup"><summary>Настройка Supabase</summary><p>Выполни <a href="./supabase-setup.sql" target="_blank" rel="noopener">SQL настройки</a> в SQL Editor проекта. В Authentication → URL Configuration добавь адрес этого сайта в Site URL и Redirect URLs.</p><label for="cloudUrl">Project URL</label><input id="cloudUrl" type="url" placeholder="https://project.supabase.co"><label for="cloudKey">Publishable key / anon key</label><input id="cloudKey" autocomplete="off" placeholder="sb_publishable_…"><p class="muted">Только публичный ключ. Secret/service_role key сюда не подходит.</p><button id="cloudConfigSave" class="btn">Подключить проект</button></details><button id="cloudClose" class="btn">Закрыть</button>`;document.body.append(dialog);
  const el=id=>document.getElementById(id);
  function status(text,kind='local'){el('cloudStatus').textContent=text;button.textContent=kind==='ok'?'Облако ✓':kind==='busy'?'Облако ↻':kind==='error'?'Облако !':'Облако';button.title=text;button.dataset.status=kind}
  function ui(){el('cloudLogin').hidden=!!session;el('cloudSigned').hidden=!session;el('cloudAccount').textContent=session?.user?.email||'';el('cloudUrl').value=config.url||'';el('cloudKey').value=config.key||'';el('cloudConflict').hidden=!pending}
  function validConfig(value){if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(value.url||''))throw Error('Укажи Project URL вида https://project.supabase.co');if((value.key||'').startsWith('sb_secret_'))throw Error('Нужен публичный ключ, не secret key');if(value.key?.startsWith('sb_publishable_'))return;try{const claims=JSON.parse(atob(value.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role==='anon')return}catch{}throw Error('Укажи Publishable key или anon key')}
  function configId(){return config.url?.replace(/\/$/,'')||''}
  async function request(path,body,authenticated=false,method=body===undefined?'GET':'POST'){
    validConfig(config);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const headers={apikey:config.key,'Content-Type':'application/json'};if(authenticated)headers.Authorization='Bearer '+session.access_token;
      const response=await fetch(configId()+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const data=await response.json();
      if(!response.ok){const error=Error(data.msg||data.message||data.error_description||'Ошибка облака: HTTP '+response.status);error.httpStatus=response.status;throw error}return data;
    }catch(e){if(e.name==='AbortError')throw Error('Облако не ответило за 12 секунд. Локальные отметки сохранены.');throw e}finally{clearTimeout(timer)}
  }
  function ownsLocal(){const owner=read('owner',null);return !owner||(owner.project===configId()&&owner.userId===session.user.id)}
  function setSession(value){const sameUser=session?.user?.id===value.user?.id;session={...value,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)};store('session:'+configId(),session);if(!sameUser){meta=ownsLocal()?read('meta:'+configId()+':'+session.user.id,null):null;pending=null;epoch++}ui()}
  async function refresh(){if(!session)throw Error('Войди в аккаунт');if(session.expires_at>Date.now()/1000+60)return;try{const next=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});setSession(next)}catch(e){if(e.httpStatus===400||e.httpStatus===401){session=null;localStorage.removeItem(PREFIX+'session:'+configId());epoch++;ui();throw Error('Сессия закончилась. Войди снова; локальный прогресс сохранён.')}throw e}}
  async function authorized(path,body){await refresh();try{return await request(path,body,true)}catch(e){if(e.httpStatus!==401)throw e;session.expires_at=0;await refresh();return request(path,body,true)}}
  function remember(row){const next={userId:session.user.id,revision:row?.revision||0,base:copy(row?.payload||progress(defaultState))};store('meta:'+configId()+':'+session.user.id,next);store('owner',{project:configId(),userId:session.user.id});meta=next}
  function apply(value){validateImport(value);const next=migrate({...value,...Object.fromEntries(LOCAL_FIELDS.map(k=>[k,state[k]]))});if(equal(progress(state),progress(next)))return;applying=true;try{if(!writeState(next))throw Error('Не удалось сохранить облачный прогресс на устройстве');fullRender()}finally{applying=false}}
  function showConflict(remote,first=false){pending={remote,first};el('cloudConflictText').textContent=first?(remote?'В облаке уже есть прогресс. Выбери: загрузить его на это устройство или заменить текущими локальными отметками. Перед заменой локальной версии будет сохранён backup.':'Локальный прогресс связан с другим аккаунтом. Выбери: отправить его в этот аккаунт или начать с пустого прогресса из облака. Перед заменой локальной версии будет сохранён backup.'):'Один и тот же пункт изменён по-разному на двух устройствах. Выбери версию для спорных пунктов; остальные изменения объединятся.';ui();status(first?'Нужно выбрать начальный прогресс.':'Есть конфликт изменений. Открой «Облако» и выбери версию.','error')}
  async function sync(){if(!session||busy||pending||loadBlocked){if(busy)again=true;return}if(!navigator.onLine){status('Нет интернета. Отметки сохранены на устройстве; синхронизация продолжится после подключения.');return}busy=true;again=false;const startedEpoch=epoch;
    try{status('Синхронизация…','busy');for(let attempt=0;attempt<4;attempt++){
      const rows=await authorized('/rest/v1/roadmap_progress?select=payload,revision,updated_at&user_id=eq.'+encodeURIComponent(session.user.id));if(startedEpoch!==epoch)return;
      const remote=rows[0]||null;if(remote)validateImport(remote.payload);
      if(!meta){if(remote||!ownsLocal()){showConflict(remote,true);return}remember(null)}
      const local=progress(state),cloud=remote?.payload||progress(defaultState),conflicts=[];
      const merged=merge(meta.base,local,cloud,'local','',conflicts);validateImport(merged);
      if(conflicts.length){showConflict(remote);return}
      if(equal(merged,cloud)){apply(merged);remember(remote);status('Синхронизировано · '+new Date().toLocaleTimeString('ru-RU'),'ok');return}
      const result=await authorized('/rest/v1/rpc/save_roadmap_progress',{expected_revision:remote?.revision||0,new_payload:merged});if(startedEpoch!==epoch)return;
      if(!result.saved)continue;
      // Changes made while the upload was in flight stay local and are sent on the next pass.
      const latest=progress(state),after=merge(local,latest,merged);remember(result.row);apply(after);again=!equal(after,merged);status(again?'Новые отметки ожидают отправки…':'Синхронизировано · '+new Date().toLocaleTimeString('ru-RU'),again?'busy':'ok');return;
    }throw Error('Другой клиент часто меняет прогресс. Повторим синхронизацию позже.');
    }catch(e){status(e.message+' Изменения остаются на этом устройстве.','error')}finally{busy=false;if(again&&session&&!pending){again=false;schedule()}}
  }
  function schedule(){clearTimeout(debounce);debounce=setTimeout(sync,800)}
  async function choose(which){if(!pending)return;const selected=pending;pending=null;try{
      const local=progress(state),remote=selected.remote?.payload||progress(defaultState);
      const merged=selected.first?(which==='remote'?remote:local):merge(meta.base,local,remote,which);
      validateImport(merged);remember(selected.remote);apply(merged);ui();await sync();
    }catch(e){pending=selected;ui();status(e.message,'error')}}
  async function action(fn){try{await fn()}catch(e){status(e.message,'error')}}
  button.onclick=()=>{ui();dialog.showModal()};el('cloudClose').onclick=()=>dialog.close();
  el('cloudConfigSave').onclick=()=>action(async()=>{if(busy)throw Error('Дождись завершения синхронизации');const next={url:el('cloudUrl').value.trim().replace(/\/$/,''),key:el('cloudKey').value.trim()};validConfig(next);store('config',next);config=next;session=null;meta=null;pending=null;epoch++;ui();status('Проект подключён. Теперь войди по email.');});
  el('cloudSend').onclick=()=>action(async()=>{const email=el('cloudEmail').value.trim();if(!el('cloudEmail').checkValidity()||!email)throw Error('Укажи email');el('cloudSend').disabled=true;try{await request('/auth/v1/otp',{email,create_user:true,email_redirect_to:location.origin+location.pathname});status('Письмо отправлено. Открой ссылку на этом устройстве или введи код из письма.')}finally{el('cloudSend').disabled=false}});
  el('cloudVerify').onclick=()=>action(async()=>{const data=await request('/auth/v1/verify',{email:el('cloudEmail').value.trim(),token:el('cloudCode').value.trim(),type:'email'});setSession(data);el('cloudCode').value='';await sync()});
  el('cloudNow').onclick=sync;el('cloudUseLocal').onclick=()=>choose('local');el('cloudUseRemote').onclick=()=>choose('remote');
  el('cloudLogout').onclick=()=>action(async()=>{if(busy)throw Error('Дождись завершения синхронизации');const previous=session;session=null;meta=null;pending=null;epoch++;localStorage.removeItem(PREFIX+'session:'+configId());ui();status('Вышел из аккаунта. Прогресс остаётся локально.');if(previous)try{await fetch(configId()+'/auth/v1/logout',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+previous.access_token},signal:AbortSignal.timeout(12000)})}catch{}});
  window.addEventListener('roadmap:saved',()=>{if(!applying&&session){status('Сохранено на устройстве; ожидает синхронизации…','busy');schedule()}});
  window.addEventListener('online',schedule);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)sync()},15000);
  window.RoadmapCloud={merge,equal,progress,sync};
  ui();status(config.url?'Войди по email для синхронизации.':'Облако ещё не подключено. Локальный прогресс сохранён.');el('cloudSetup').open=!config.url;
  (async()=>{try{if(!config.url)return;validConfig(config);const params=new URLSearchParams(location.hash.slice(1));if(params.has('access_token')){
      const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');history.replaceState(null,'',location.pathname+location.search);if(!refresh_token)throw Error('Неполная ссылка входа');session={access_token};const user=await request('/auth/v1/user',undefined,true);setSession({access_token,refresh_token,user,expires_in:Number(params.get('expires_in'))||3600});
    }else{const cached=read('session:'+configId(),null);if(cached?.user?.id)setSession(cached)}if(session)await sync();
  }catch(e){session=null;ui();status(e.message,'error')}})();
})();
