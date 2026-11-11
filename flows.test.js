'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sconnect-test-'));
const proc = spawn(process.execPath, ['--experimental-sqlite',path.resolve(__dirname,'../server.js')], {
  cwd: path.resolve(__dirname,'..'),
  env: {...process.env,PORT:'0',HOST:'127.0.0.1',DB_PATH:path.join(dir,'test.sqlite')}, stdio:['ignore','pipe','pipe']
});
let base;
let log='';
let errlog='';
proc.stderr.on('data', chunk=>{errlog+=chunk.toString();});
const started=new Promise((resolve,reject)=>{
  proc.stdout.on('data', chunk=>{log+=chunk.toString();const found=log.match(/SCONNECT_URL=(\S+)/);if(found){base=found[1];resolve();}});
  proc.on('exit',code=>reject(new Error('Servidor encerrou: '+code+' '+errlog)));
  setTimeout(()=>reject(new Error('Tempo excedido ao inicializar servidor: '+errlog)),8000).unref();
});
after(async()=>{
  proc.kill('SIGTERM');
  await Promise.race([once(proc,'exit'),new Promise(r=>setTimeout(r,1500))]);
  fs.rmSync(dir,{recursive:true,force:true});
});
function client() {
  return {
    cookie:'',csrf:'',
    async call(method,route,body) {
      await started;
      const headers={};
      if(body!==undefined)headers['content-type']='application/json';
      if(this.cookie)headers.cookie=this.cookie;
      if(this.csrf)headers['x-csrf-token']=this.csrf;
      const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const payload=await response.json();
      const setCookie=response.headers.get('set-cookie');
      if(setCookie)this.cookie=setCookie.split(';')[0];
      if(payload.csrf)this.csrf=payload.csrf;
      return {...payload,httpStatus:response.status};
    }
  };
}
const c=client(),a=client(),b=client();
const candidate={role:'candidate',name:'Francisco Xavier',email:'francisco@example.test',password:'SenhaDeTeste987'};
const employer={role:'employer',name:'Responsável A',email:'empresa-a@example.test',password:'SenhaDeTeste987',company:'Empresa A',location:'Saquarema - RJ'};
const other={role:'employer',name:'Responsável B',email:'empresa-b@example.test',password:'SenhaDeTeste987',company:'Empresa B',location:'Araruama - RJ'};
let jobId,applicationId;
test('Banco vazio, sem nomes ou vagas predefinidos',async()=>{
  const res=await c.call('GET','/api/jobs');
  assert.equal(res.httpStatus,200); assert.deepEqual(res.jobs,[]);
  const me=await c.call('GET','/api/auth/me');
  assert.equal(me.user,null);
});
test('Cadastro candidato com o nome informado e senha',async()=>{
  const res=await c.call('POST','/api/auth/register',candidate);
  assert.equal(res.httpStatus,200);assert.equal(res.user.name,'Francisco Xavier');
  assert.equal(res.user.role,'candidate');assert.ok(c.cookie.includes('sconnect_session='));
  assert.equal((await c.call('GET','/api/auth/me')).user.name,'Francisco Xavier');
  assert.equal((await c.call('POST','/api/auth/register',candidate)).httpStatus,409);
  assert.equal((await c.call('POST','/api/jobs',{})).httpStatus,403);
});
test('Cadastro de dois empregadores independentes',async()=>{
  assert.equal((await a.call('POST','/api/auth/register',employer)).user.company,'Empresa A');
  assert.equal((await b.call('POST','/api/auth/register',other)).user.company,'Empresa B');
});
test('Empresa publica; busca pública mostra vaga verdadeira',async()=>{
  const res=await a.call('POST','/api/jobs',{
    title:'Atendente',description:'Atender clientes e organizar a loja.',requirements:'Boa comunicação',location:'Saquarema - RJ',type:'Efetivo',salary:'A combinar'
  });
  assert.equal(res.httpStatus,201);jobId=res.job.id;
  const results=await c.call('GET','/api/jobs?q=Atendente&type=Efetivo');
  assert.equal(results.jobs.length,1);assert.equal(results.jobs[0].company,'Empresa A');
  assert.equal((await c.call('GET','/api/jobs?type=Inv%C3%A1lido')).httpStatus,400);
});
test('Candidatura única; empresa vê apenas a própria vaga',async()=>{
  const applied=await c.call('POST',`/api/jobs/${jobId}/apply`,{});
  assert.equal(applied.httpStatus,201);applicationId=applied.id;
  assert.equal((await c.call('POST',`/api/jobs/${jobId}/apply`,{})).httpStatus,409);
  assert.equal((await b.call('GET',`/api/jobs/${jobId}/applications`)).httpStatus,403);
  const res=await a.call('GET',`/api/jobs/${jobId}/applications`);
  assert.equal(res.httpStatus,200);assert.equal(res.applications.length,1);
  assert.equal(res.applications[0].name,'Francisco Xavier');
});
test('Permissões e alteração de situação com reflexo no candidato',async()=>{
  assert.equal((await c.call('PATCH',`/api/jobs/${jobId}`,{status:'Encerrada'})).httpStatus,403);
  assert.equal((await b.call('PATCH',`/api/applications/${applicationId}/status`,{status:'Entrevista'})).httpStatus,403);
  assert.equal((await a.call('PATCH',`/api/applications/${applicationId}/status`,{status:'Entrevista'})).httpStatus,200);
  const mine=await c.call('GET','/api/applications/mine');
  assert.equal(mine.applications[0].status,'Entrevista');
});
test('Candidato edita nome e perfil sem nome predefinido',async()=>{
  const r=await c.call('PUT','/api/profile',{name:'Francisco de Souza',education:'Ensino médio',experience:'Atendimento',skills:'Organização'});
  assert.equal(r.httpStatus,200);assert.equal(r.profile.name,'Francisco de Souza');
  const apps=await a.call('GET',`/api/jobs/${jobId}/applications`);
  assert.equal(apps.applications[0].name,'Francisco de Souza');
});
test('Edição e encerramento de vaga',async()=>{
  let r=await a.call('PATCH',`/api/jobs/${jobId}`,{title:'Atendente de loja',description:'Receber clientes e organizar prateleiras.',requirements:'Experiência básica',location:'Saquarema - RJ',type:'Temporário',salary:'A combinar'});
  assert.equal(r.httpStatus,200);assert.equal(r.job.title,'Atendente de loja');
  assert.equal((await b.call('PATCH',`/api/jobs/${jobId}`,{status:'Encerrada'})).httpStatus,403);
  r=await a.call('PATCH',`/api/jobs/${jobId}`,{status:'Encerrada'});
  assert.equal(r.job.status,'Encerrada');
  assert.equal((await c.call('GET','/api/jobs')).jobs.length,0);
  assert.equal((await c.call('POST',`/api/jobs/${jobId}/apply`,{})).httpStatus,404);
});
test('Proteção CSRF e autenticação por senha',async()=>{
  const hacker=client();
  hacker.cookie=c.cookie;
  assert.equal((await hacker.call('PUT','/api/profile',{name:'Intruso',education:'',experience:'',skills:''})).httpStatus,403);
  const bad=client();
  assert.equal((await bad.call('POST','/api/auth/login',{email:candidate.email,password:'senha-incorreta'})).httpStatus,401);
  const ok=await bad.call('POST','/api/auth/login',{email:candidate.email,password:candidate.password});
  assert.equal(ok.httpStatus,200);assert.equal(ok.user.name,'Francisco de Souza');
  assert.equal((await bad.call('POST','/api/auth/logout',{})).httpStatus,200);
  assert.equal((await bad.call('GET','/api/auth/me')).user,null);
});
