const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../test-results/designs');
fs.mkdirSync(root,{recursive:true});
(async()=>{
 const {startServer}=await import('../scripts/serve.mjs');
 const {phases}=await import('../src/data/roadmap.js');
 const server=await startServer({port:0});
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.ROADMAP_BROWSER_PATH||undefined,headless:true});
  const designs=process.argv.slice(2);
  if(!designs.length)designs.push('atlas','session','ledger');
  assert.ok(designs.every(id=>['atlas','session','ledger'].includes(id)),'known design names');
  for(const id of designs){
   const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin+'/'))external.push(r.url());});
   await page.goto(origin+'/distinct/'+id+'.html');
   await page.waitForSelector('.preview-banner');assert.equal(await page.locator('.phase').count(),13);assert.equal(await page.locator('#startup').count(),0);
   if(id==='atlas'){
    const selected=page.locator('.map-node.selected'),color=await selected.evaluate(el=>getComputedStyle(el).backgroundColor);
    await selected.hover();assert.equal(await selected.evaluate(el=>getComputedStyle(el).backgroundColor),color,'selected node retains contrast on hover');await page.mouse.move(0,0);
    assert.equal(await page.locator('.dependency-edge').count(),phases.reduce((n,p)=>n+p.deps.length,0));
    for(const p of phases)for(const dep of p.deps){
     const edge=page.locator(`.dependency-edge[data-from="${dep}"][data-to="${p.id}"]`);
     assert.equal(await edge.count(),1,'actual prerequisite edge');
     assert.match(await edge.getAttribute('marker-end'),/map-arrow/);
     const from=await page.locator(`.map-node[data-open-phase="${dep}"]`).boundingBox(),to=await page.locator(`.map-node[data-open-phase="${p.id}"]`).boundingBox();
     assert.ok(from.y+from.height<to.y,'prerequisites are above dependents');
     assert.ok(await edge.evaluate(el=>Number.parseFloat(getComputedStyle(el).strokeWidth)>=3),'readable line thickness');
    }
    // Long connections must go around unrelated nodes, never through them.
    assert.equal(await page.evaluate(()=>{
     const nodes=[...document.querySelectorAll('.map-node')].map(el=>({id:el.dataset.openPhase,x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight}));
     return [...document.querySelectorAll('.dependency-edge')].some(edge=>{
      const length=edge.getTotalLength();
      for(let d=0;d<=length;d+=2){const point=edge.getPointAtLength(d);if(nodes.some(n=>n.id!==edge.dataset.from&&n.id!==edge.dataset.to&&point.x>n.x-2&&point.x<n.x+n.w+2&&point.y>n.y-2&&point.y<n.y+n.h+2))return true;}
      return false;
     });
    }),false,'connections do not cross unrelated phase nodes');
   }
   if(id==='session'){
    assert.equal(await page.locator('.session-program-progress progress').getAttribute('value'),'0');
    assert.equal(await page.locator('#phase-p0 .session-phase-progress progress').count(),2);
    assert.equal(await page.locator('#phase-p0 .session-phase-progress').isVisible(),true);
   }
   // Theme choice is shared product behavior, independent from layout choice.
   if(await page.locator('html').getAttribute('data-theme')==='dark')await page.locator('#themeBtn').click();
   await page.screenshot({path:root+'/'+id+'.png'});
   await page.locator('#themeBtn').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
   await page.screenshot({path:root+'/'+id+'-dark.png'});
   await page.locator('#themeBtn').click();
   async function phase(name){
    if(id==='session')await page.locator('.session-phases [data-open-phase="'+name+'"]').click();
    else if(id==='atlas')await page.locator('.map-node[data-open-phase="'+name+'"]').click();
    else {if(!await page.locator('#phase-'+name).evaluate(el=>el.classList.contains('selected-phase')))await page.locator('#phase-'+name+' .row-title').click();}
    await page.locator('#phase-'+name+'.selected-phase').waitFor();
   }
   async function step(name){if(id==='session')await page.locator('.selected-phase .work-steps [data-step="'+name+'"]').click();}
   async function screen(name){await page.evaluate(name=>document.querySelector('.sections-menu a[href="#'+name+'"]')?.click(),name);await page.locator('#'+name).waitFor({state:'visible'});}
   await phase('p0');await step('topics');await page.locator('[data-setup="p0:m:0"]').check();await page.locator('[data-mastery="p0:m:2"]').selectOption('3');
   if(id==='session')await page.waitForFunction(()=>document.querySelector('#phase-p0 .session-phase-progress progress').value===2);
   await step('practice');await page.locator('[data-practice="p0:p:0"]').check();
   if(id==='session')await page.waitForFunction(()=>document.querySelectorAll('#phase-p0 .session-phase-progress progress')[1].value===1);
   if(id==='session')await page.screenshot({path:root+'/session-partial-progress.png'});
   await step('proof');await page.locator('[data-evidence="p0"]').fill('Проверил сборку и тесты самостоятельно.');
   if(id==='ledger')await page.waitForFunction(()=>document.querySelector('#phase-p0 .row-evidence').textContent==='Записано');
   await page.locator('[data-checkpoint="p0"]').click();
   await page.locator('#checkpointModal').waitFor({state:'visible'});assert.equal(await page.locator('[data-cptask]').count(),4);await page.locator('#checkpointModal [data-close-modal]').click();
   await phase('p1');await step('topics');await page.locator('[data-mastery="p1:m:0"]').selectOption('3');
   if(id==='atlas'){
    const highlighted=await page.locator('.dependency-edge.selected-edge').evaluateAll(edges=>edges.map(e=>e.dataset.from+'>'+e.dataset.to).sort());
    assert.deepEqual(highlighted,['p0>p1','p1>p2','p1>p7','p1>p8']);
   }
   await screen('overview');await page.locator('#nextActionBtn').click();assert.equal(await page.locator('#phase-p0.selected-phase').count(),1);
   await screen('overview');await page.locator('#addTodayBtn').click();await page.locator('[data-today-text="0"]').fill('Своя задача');await page.locator('[data-today-check="0"]').check();
   await screen('noai');await page.locator('#noaiMinutes').fill('45');await page.locator('#noaiTopic').fill('Task Tracker');await page.locator('#noaiNotes').fill('Написал код самостоятельно');await page.locator('#addNoaiBtn').click();assert.equal(await page.locator('#noaiList .list-item').count(),1);
   for(const name of ['resources','career','coverage','history','week','mistakes'])await screen(name);
   await screen('roadmap');await page.reload();await page.waitForSelector('.preview-banner');await phase('p0');await step('topics');assert.equal(await page.locator('[data-setup="p0:m:0"]').isChecked(),true);assert.equal(await page.locator('[data-mastery="p0:m:2"]').inputValue(),'3');
   await page.locator('#searchInput').fill('HashMap');await page.waitForTimeout(50);assert.ok(await page.locator('#phase-p2').isVisible(),'search exposes matching phase');await page.locator('#searchInput').fill('');
   await page.locator('.program-tools summary').click();await page.locator('#statusFilter').selectOption('done');await page.waitForTimeout(50);assert.equal(await page.locator('.empty-program').isVisible(),true);await page.locator('#statusFilter').selectOption('all');await page.locator('.program-tools summary').click();
   await phase('p0');await page.locator('[data-continue]').click();assert.equal(await page.locator('#phase-p0').isVisible(),true);
   await page.locator('#focusBtn').click();await screen('resources');assert.equal(await page.locator('#resources').isVisible(),true);await page.locator('#focusBtn').click();await screen('roadmap');
   assert.equal(await page.evaluate(()=>Object.prototype.hasOwnProperty.call(localStorage,'javaRoadmapV3')),false,'production key stays untouched');
   // Checkpoint dialogs and the all-sections menu must remain inside each viewport.
   for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'overflow '+id+' '+width);
    await page.locator('.sections-menu summary').click();await page.locator('.sections-menu a[href="#resources"]').click();await page.locator('#resources').waitFor({state:'visible'});
    await screen('roadmap');await step('proof');await page.locator('[data-checkpoint="p0"]').click();await page.locator('#checkpointModal').waitFor({state:'visible'});
    const bounds=await page.locator('#checkpointModal .modal').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,'modal width '+id+' '+width);
    await page.locator('#checkpointModal [data-close-modal]').click();await step('topics');
   }
   if(id==='session'){
    await step('topics');for(const input of await page.locator('#phase-p0 [data-setup]').all())await input.check();for(const select of await page.locator('#phase-p0 [data-mastery]').all())await select.selectOption('3');
    await step('practice');for(const input of await page.locator('#phase-p0 [data-practice]').all())await input.check();
    await step('proof');await page.locator('[data-checkpoint="p0"]').click();for(const input of await page.locator('[data-cptask]').all())await input.check();await page.locator('#checkpointPassed').check();await page.locator('#saveCheckpointBtn').click();
    await page.waitForFunction(()=>document.querySelector('.session-program-progress progress').value===1);
    assert.match(await page.locator('.program-progress-label').innerText(),/8%/);
    await page.locator('[data-collapse="p0"]').click();assert.equal(await page.locator('#phase-p0 .session-phase-progress').isVisible(),true);await page.locator('[data-collapse="p0"]').click();
    await page.reload();await page.waitForFunction(()=>document.querySelector('.session-program-progress progress')?.value===1);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS '+id+': 13 phases, tracking, evidence, checkpoint, all screens, persistence, themes, 360/390/768/1440 navigation and modal');
   await context.close();
   // Inspect actual first-use layouts with clean progress at every required size.
   for(const width of id==='session'?[360,390,768,1440,2537]:[360,390,768,1440]){
    const c=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await c.newPage();
    await p.goto(origin+'/distinct/'+id+'.html');await p.waitForSelector('.preview-banner');if(await p.locator('html').getAttribute('data-theme')==='dark')await p.locator('#themeBtn').click();
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'clean overflow '+id+' '+width);
    await p.screenshot({path:root+'/'+id+'-'+width+'.png',fullPage:true});await p.screenshot({path:root+'/'+id+'-'+width+'-viewport.png'});
    if(id==='atlas'){
     if(width<=560)await p.locator('.mobile-map-toggle').click();
     if(width<=560){
      const scroller=await p.locator('.map-scroll').boundingBox(),node=await p.locator('.map-node.selected').boundingBox();
      assert.ok(node.x>=scroller.x&&node.x+node.width<=scroller.x+scroller.width,'selected node fits initial mobile map');
     }
     assert.equal(await p.locator('.dependency-map').isVisible(),true);await p.locator('.dependency-map').screenshot({path:root+'/atlas-map-'+width+'.png'});
     await p.locator('.map-node[data-open-phase="p8"]').click();assert.equal(await p.locator('#phase-p8.selected-phase').count(),1);
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'open map overflow '+width);
    }
    if(id==='atlas'||id==='session'){
     await p.locator('#themeBtn').click();await p.screenshot({path:root+'/'+id+'-'+width+'-dark-viewport.png'});
     if(id==='atlas')await p.locator('.dependency-map').screenshot({path:root+'/atlas-map-'+width+'-dark.png'});
     if(id==='session')assert.equal(await p.locator('#phase-p0 .session-phase-progress').isVisible(),true);
    }
    await c.close();
   }
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(origin+'/?designs=4');await page.screenshot({path:root+'/comparison.png',fullPage:true});
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
