const file=document.querySelector('#file');
const result=document.querySelector('#result');
const expectedBoard='5105949528';
file.addEventListener('change',async()=>{
 result.textContent='Ellenőrzés...';
 const chosen=file.files?.[0];
 if(!chosen){result.textContent='Nincs fájl kiválasztva.';return;}
 if(chosen.size>5_000_000){result.textContent='Elutasítva: a fájl túl nagy (5 MB felett).';return;}
 try{
  const obj=JSON.parse(await chosen.text());
  const tasks=obj?.tasks;
  const ids=Array.isArray(tasks)?tasks.map(t=>t?.itemId):[];
  const validForecast=Array.isArray(tasks)&&tasks.every(t=>typeof t?.itemId==='string'&&/^\d+$/.test(t.itemId)&&(!t.forecast||(typeof t.forecast.from==='string'&&typeof t.forecast.to==='string'&&t.forecast.from<=t.forecast.to)));
  if(obj?.schemaVersion!==1||obj?.format!=='flow-lps-plan-preview'||obj?.status!=='TEST_ONLY'||obj?.isApprovedPlan!==false||obj?.boardId!==expectedBoard||!validForecast||obj.taskCount!==ids.length||new Set(ids).size!==ids.length||!Array.isArray(obj.changes)||obj.changeCount!==obj.changes.length){throw Error('Nem megfelelő Flow LPS TEST_ONLY tervelőnézet.');}
  result.textContent='Helyi ellenőrzés sikeres.\nBoard: '+obj.boardId+'\nFeladatok: '+obj.taskCount+'\nVáltozások: '+obj.changeCount+'\nStátusz: TEST_ONLY – nem jóváhagyott, nem feltöltött terv.';
 }catch(e){result.textContent='A fájl nem használható: '+(e instanceof SyntaxError?'érvénytelen JSON.':e.message);}
});
