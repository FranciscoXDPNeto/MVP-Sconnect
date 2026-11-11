'use strict';
// Frontend sem framework; sem contas ou vagas fictícias.
const root = document.querySelector('#app');
const nav = document.querySelector('#nav');
const logoutBtn = document.querySelector('#logout');
const userShort = document.querySelector('#user-short');
const toast = document.querySelector('#toast');
const state = { user: null, csrf: null, view: 'home', selected: null, filters: { q: '', type: '' } };
let busy = false;

const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const field = (label, name, value = '', opts = {}) => {
  const attrs = `${opts.required ? 'required' : ''} ${opts.min ? `minlength="${opts.min}"` : ''} ${opts.max ? `maxlength="${opts.max}"` : ''} placeholder="${html(opts.placeholder || '')}"`;
  const control = opts.multiline
    ? `<textarea name="${name}" ${attrs}>${html(value)}</textarea>`
    : `<input name="${name}" type="${opts.type || 'text'}" value="${html(value)}" ${attrs}>`;
  return `<label class="field">${html(label)}${control}</label>`;
};
const back = view => `<button class="back" data-view="${view}">← Voltar</button>`;
const pill = status => `<span class="pill ${status === 'Aberta' ? 'open' : status === 'Encerrada' ? 'closed' : ''}">${html(status)}</span>`;
const card = job => `<article class="card"><div class="job-meta">${pill(job.type)} ${job.status === 'Encerrada' ? pill(job.status) : ''}</div><h3>${html(job.title)}</h3><p>${html(job.company)} · ${html(job.location)}</p><p>${html(job.salary)}</p><div class="card-actions"><button class="btn small" data-action="job" data-id="${job.id}">Ver detalhes</button></div></article>`;
function notify(text) { toast.textContent = text; toast.classList.add('visible'); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('visible'), 3500); }
function formValue(form) { return Object.fromEntries(new FormData(form)); }
async function api(url, opts = {}) {
  const method = opts.method || 'GET';
  const headers = {};
  if (opts.data !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(url, { method, headers, credentials: 'same-origin', body: opts.data !== undefined ? JSON.stringify(opts.data) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
  return payload;
}
function setAuth(payload) { state.user = payload.user; state.csrf = payload.csrf; }
function syncNav() {
  const user = state.user;
  logoutBtn.hidden = !user;
  userShort.textContent = user ? user.name : '';
  if (!user) { nav.hidden = true; nav.innerHTML = ''; return; }
  const items = user.role === 'candidate'
    ? [['jobs','Vagas'],['my-apps','Candidaturas'],['profile','Perfil']]
    : [['employer','Início'],['new-job','Publicar'],['employer-profile','Empresa']];
  nav.hidden = false;
  nav.innerHTML = items.map(([view,title]) => `<button type="button" data-view="${view}" class="${state.view===view?'active':''}">${title}</button>`).join('');
}
function draw(content) { root.innerHTML = content; syncNav(); root.scrollIntoView({ behavior: 'instant', block: 'start' }); }
const loading = () => { root.innerHTML = '<div class="loading">Carregando...</div>'; };
function landing() {
  return `<div class="hero"><div class="hero-star">✦</div><div class="eyebrow">Saquarema · RJ</div><h1>Uma ponte entre talentos e oportunidades.</h1><p>Encontre vagas ou divulgue oportunidades em um ambiente organizado para quem vive e trabalha na região.</p><div class="hero-actions"><button class="btn" data-view="register-candidate">Criar conta de candidato</button><button class="btn ghost" data-view="register-employer">Cadastrar empresa</button></div></div><div class="cols"><div class="card"><h3>Já tem uma conta?</h3><p>Acesse suas vagas, inscrições e perfil.</p><button class="btn ghost" data-view="login">Entrar</button></div><div class="card"><h3>Explore as vagas</h3><p>Consulte oportunidades públicas sem realizar cadastro.</p><button class="btn ghost" data-view="jobs">Buscar oportunidades</button></div></div><p class="footer-note">MVP acadêmico. Nenhuma vaga ou conta de exemplo é inserida automaticamente.</p>`;
}
function registration(role) {
  const company = role === 'employer';
  return `${back('home')}<span class="eyebrow">${company ? 'Conta empresarial':'Conta do candidato'}</span><h1>${company ? 'Cadastrar empresa' : 'Criar perfil de candidato'}</h1><p class="muted">Informe seus próprios dados. Nenhum nome é predefinido.</p><form class="form" id="register-form"><input type="hidden" name="role" value="${company ? 'employer':'candidate'}">${field(company?'Nome do responsável *':'Nome completo *','name','',{required:true,min:3,max:90,placeholder:'Digite seu nome'})}${field('E-mail *','email','',{type:'email',required:true,max:160,placeholder:'seuemail@exemplo.com'})}${field('Senha *','password','',{type:'password',required:true,min:8,max:100,placeholder:'Mínimo de 8 caracteres'})}${company ? field('Nome da empresa *','company','',{required:true,min:2,max:120}) + field('Cidade / local *','location','Saquarema - RJ',{required:true,min:3,max:120}) : field('Formação','education','',{max:150,placeholder:'Ex.: Ensino médio completo'})+field('Experiência','experience','',{multiline:true,max:1500})+field('Habilidades','skills','',{multiline:true,max:800})}<div class="form-actions"><button type="submit" class="btn">Criar conta</button></div></form><p class="notice">Use dados de teste na avaliação acadêmica. Esta aplicação salva informações no banco local do computador.</p>`;
}
function login() { return `${back('home')}<span class="eyebrow">Bem-vindo de volta</span><h1>Entrar na conta</h1><form id="login-form" class="form">${field('E-mail','email','',{type:'email',required:true})}${field('Senha','password','',{type:'password',required:true})}<button class="btn" type="submit">Entrar</button></form><p class="muted">Não possui uma conta? <button class="btn ghost small" data-view="register-candidate">Cadastrar candidato</button></p>`; }
function searchForm() { return `<form id="search-form" class="toolbar"><label class="field">Cargo, empresa ou cidade<input name="q" value="${html(state.filters.q)}" placeholder="O que você procura?"></label><label class="field">Contrato<select name="type"><option value="">Todos</option>${['Efetivo','Temporário','Estágio'].map(t=>`<option ${state.filters.type===t?'selected':''}>${t}</option>`).join('')}</select></label><button class="btn" type="submit">Buscar</button></form>`; }
async function jobsView() { const query = new URLSearchParams(state.filters); const result = await api('/api/jobs?' + query); const header = state.user?.role === 'candidate' ? `<div class="eyebrow">Área do candidato</div><h1>Olá, ${html(state.user.name)}!</h1><h2>Vagas disponíveis</h2>` : '<div class="eyebrow">Oportunidades locais</div><h1>Vagas disponíveis</h1>'; return `${header}<p class="muted">Busque por cargo, empresa ou localização.</p>${searchForm()}<div class="section-head"><h2>${result.jobs.length} resultado(s)</h2></div>${result.jobs.length ? `<div class="jobs">${result.jobs.map(card).join('')}</div>` : `<div class="empty">Nenhuma vaga aberta encontrada. Empresas cadastradas podem publicar a primeira oportunidade.</div>`}`; }
async function detailView() { const { job } = await api(`/api/jobs/${state.selected}`); const applied = state.user?.role === 'candidate' && (await api('/api/applications/mine')).applications.some(a=>a.job_id===job.id); return `${back('jobs')}<span class="eyebrow">Detalhes da oportunidade</span><h1>${html(job.title)}</h1><div class="card"><h3>${html(job.company)}</h3><p>${html(job.location)}</p><div class="job-meta">${pill(job.type)} ${pill(job.status)}</div><p>Remuneração: ${html(job.salary)}</p></div><h2>Atividades</h2><p class="detail-block">${html(job.description)}</p><h2>Requisitos</h2><p class="detail-block">${html(job.requirements)}</p>${state.user?.role === 'candidate' ? `<button class="btn" data-action="apply" data-id="${job.id}" ${applied ? "disabled" : ""}>${applied ? "Candidatura já enviada" : "Candidatar-se à vaga"}</button>` : !state.user ? `<button class="btn" data-view="login">Entrar para se candidatar</button>` : ''}`; }
async function applicationsView() { const {applications} = await api('/api/applications/mine'); return `<span class="eyebrow">Acompanhamento</span><h1>Minhas candidaturas</h1><p class="muted">Acompanhe os retornos das empresas.</p>${applications.length ? applications.map(a=>`<div class="card"><h3>${html(a.title)}</h3><p>${html(a.company)} · ${html(a.location)}</p><div class="job-meta">${pill(a.status)}</div><button class="btn ghost small" data-action="job" data-id="${a.job_id}">Ver vaga</button></div>`).join('') : `<div class="empty">Você ainda não se candidatou a vagas. <button class="btn ghost" data-view="jobs">Buscar vagas</button></div>`}`; }
function candidateProfile() { const u=state.user; return `<span class="eyebrow">Conta pessoal</span><h1>Meu perfil</h1><div class="card profile-head"><div class="avatar">${html(initials(u.name))}</div><div><h3>${html(u.name)}</h3><p>${html(u.email)}</p></div></div><h2>Qualificações</h2><div class="card"><p><strong>Formação:</strong> ${html(u.education || 'Não informada')}</p><p><strong>Experiência:</strong></p><div class="detail-block">${html(u.experience || 'Não informada')}</div><p><strong>Habilidades:</strong></p><div class="detail-block">${html(u.skills || 'Não informadas')}</div></div><button class="btn" data-view="edit-profile">Editar meu perfil</button>`; }
function profileEdit() { const u = state.user; return `${back('profile')}<h1>Editar perfil</h1><form id="profile-form" class="form">${field('Nome completo *','name',u.name,{required:true,min:3,max:90})}${field('Formação','education',u.education,{max:150})}${field('Experiência','experience',u.experience,{multiline:true,max:1500})}${field('Habilidades','skills',u.skills,{multiline:true,max:800})}<button type="submit" class="btn">Salvar alterações</button></form>`; }
async function employerHome() { const {jobs} = await api('/api/employer/jobs'); return `<span class="eyebrow">Painel da empresa</span><h1>${html(state.user.company)}</h1><p class="muted">Responsável: ${html(state.user.name)}. Gerencie oportunidades e candidaturas.</p><div class="cols"><div class="card"><div class="mini-desc">Vagas cadastradas</div><div class="stat">${jobs.length}</div></div><div class="card"><div class="mini-desc">Vagas abertas</div><div class="stat">${jobs.filter(j=>j.status==='Aberta').length}</div></div></div><div class="section-head"><h2>Minhas vagas</h2><button class="btn small" data-view="new-job">Publicar vaga</button></div>${jobs.length ? jobs.map(j=>`<div class="card"><div class="card-row"><h3>${html(j.title)}</h3></div><div class="job-meta">${pill(j.status)} ${pill(j.type)}</div><p>${html(j.location)}</p><div class="card-actions"><button class="btn small" data-action="candidates" data-id="${j.id}">Candidaturas</button><button class="btn ghost small" data-action="edit-job" data-id="${j.id}">Editar</button><button class="btn ${j.status==='Aberta'?'danger':'tertiary'} small" data-action="toggle-job" data-id="${j.id}" data-status="${j.status==='Aberta'?'Encerrada':'Aberta'}">${j.status==='Aberta'?'Encerrar':'Reabrir'}</button></div></div>`).join('') : `<div class="empty">Ainda não há vagas publicadas. Use “Publicar vaga” para começar.</div>`}`; }
function jobForm(job = null) { const j = job || {title:'',location:state.user.location,type:'Efetivo',salary:'A combinar',description:'',requirements:''}; return `${back('employer')}<span class="eyebrow">Empresa</span><h1>${job?'Editar vaga':'Publicar uma vaga'}</h1><form id="job-form" class="form">${field('Cargo *','title',j.title,{required:true,min:3,max:100})}${field('Localização *','location',j.location,{required:true,min:3,max:120})}<label class="field">Tipo de contratação<select name="type">${['Efetivo','Temporário','Estágio'].map(t=>`<option ${j.type===t?'selected':''}>${t}</option>`).join('')}</select></label>${field('Remuneração *','salary',j.salary,{required:true,max:90})}${field('Descrição *','description',j.description,{required:true,min:10,max:2000,multiline:true})}${field('Requisitos *','requirements',j.requirements,{required:true,min:3,max:1200,multiline:true})}<button class="btn" type="submit">${job?'Salvar alterações':'Publicar vaga'}</button></form>`; }
async function candidatesView() { const { applications } = await api(`/api/jobs/${state.selected}/applications`); return `${back('employer')}<span class="eyebrow">Processo seletivo</span><h1>Candidaturas da vaga</h1><p class="muted">Os candidatos visualizarão a situação atualizada no próprio painel.</p>${applications.length ? applications.map(a=>`<div class="card"><h3>${html(a.name)}</h3><p><strong>Formação:</strong> ${html(a.education || 'Não informada')}</p><p><strong>Experiência:</strong></p><p class="detail-block">${html(a.experience || 'Não informada')}</p><p><strong>Habilidades:</strong></p><p class="detail-block">${html(a.skills || 'Não informadas')}</p><label class="field">Situação da candidatura<select class="status-select" data-status-id="${a.id}">${['Em análise','Entrevista','Não selecionado'].map(t=>`<option ${a.status===t?'selected':''}>${t}</option>`).join('')}</select></label></div>`).join('') : `<div class="empty">Esta vaga ainda não recebeu candidaturas.</div>`}`; }
function employerProfile() { const u=state.user; return `<span class="eyebrow">Conta empresarial</span><h1>Dados da empresa</h1><div class="card"><h3>${html(u.company)}</h3><p>Responsável: ${html(u.name)}</p><p>${html(u.email)}</p><p>${html(u.location)}</p></div><button class="btn" data-view="edit-employer">Editar informações</button>`; }
function employerEdit() { const u=state.user; return `${back('employer-profile')}<h1>Editar empresa</h1><form class="form" id="employer-form">${field('Nome do responsável *','name',u.name,{required:true,min:3,max:90})}${field('Empresa *','company',u.company,{required:true,min:2,max:120})}${field('Localização *','location',u.location,{required:true,min:3,max:120})}<button class="btn" type="submit">Salvar alterações</button></form>`; }
const guestViews = ['home','login','register-candidate','register-employer','jobs','detail'];
const candidateViews = ['my-apps','profile','edit-profile'];
const employerViews = ['employer','new-job','edit-job','candidates','employer-profile','edit-employer'];
async function navigate(view, selected) {
  if (selected !== undefined) state.selected = selected;
  if (candidateViews.includes(view) && state.user?.role!=='candidate') view='login';
  if (employerViews.includes(view) && state.user?.role!=='employer') view='login';
  state.view = view;
  loading();
  try {
    let content;
    switch(view) {
      case 'home': content=landing();break;
      case 'register-candidate': content=registration('candidate');break;
      case 'register-employer': content=registration('employer');break;
      case 'login': content=login();break;
      case 'jobs': content=await jobsView();break;
      case 'detail': content=await detailView();break;
      case 'my-apps': content=await applicationsView();break;
      case 'profile': content=candidateProfile();break;
      case 'edit-profile': content=profileEdit();break;
      case 'employer': content=await employerHome();break;
      case 'new-job': content=jobForm();break;
      case 'edit-job': {const {job}=await api(`/api/jobs/${state.selected}`); content=jobForm(job);break;}
      case 'candidates': content=await candidatesView();break;
      case 'employer-profile': content=employerProfile();break;
      case 'edit-employer': content=employerEdit();break;
      default: content=landing();break;
    }
    draw(content);
  } catch (e) { root.innerHTML = `<div class="empty">${html(e.message)}<div class="form-actions"><button class="btn ghost" data-view="home">Voltar ao início</button></div></div>`; syncNav(); }
}
async function submit(event) {
  const form=event.target;
  if (!['register-form','login-form','profile-form','employer-form','job-form','search-form'].includes(form.id)) return;
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy=true;
  const data=formValue(form);
  const btn=form.querySelector('[type="submit"]');
  if(btn)btn.disabled=true;
  try {
    if (form.id==='register-form') {
      const payload=await api('/api/auth/register',{method:'POST',data});
      setAuth(payload);
      if (data.role==='candidate' && (data.education || data.skills || data.experience)) {
        const updated=await api('/api/profile',{method:'PUT',data:{name:data.name,education:data.education,experience:data.experience,skills:data.skills}});
        state.user=updated.profile;
      }
      notify('Conta criada. Bem-vindo(a), '+state.user.name+'!');
      await navigate(data.role==='candidate'?'jobs':'employer');
    } else if (form.id==='login-form') {
      setAuth(await api('/api/auth/login',{method:'POST',data}));
      notify('Acesso realizado.');
      await navigate(state.user.role==='candidate'?'jobs':'employer');
    } else if (form.id==='profile-form') {
      const result=await api('/api/profile',{method:'PUT',data});state.user=result.profile;
      notify('Perfil atualizado.');await navigate('profile');
    } else if (form.id==='employer-form') {
      const result=await api('/api/employer',{method:'PUT',data});state.user=result.employer;
      notify('Dados atualizados.');await navigate('employer-profile');
    } else if (form.id==='job-form') {
      if(state.view==='edit-job') await api(`/api/jobs/${state.selected}`,{method:'PATCH',data});
      else await api('/api/jobs',{method:'POST',data});
      notify('Vaga salva.');await navigate('employer');
    } else if (form.id==='search-form') {
      state.filters={q:data.q||'',type:data.type||''};await navigate('jobs');
    }
  } catch(e) {notify(e.message);} finally {busy=false;if(btn?.isConnected)btn.disabled=false;}
}
document.addEventListener('submit', event => {void submit(event);});
document.addEventListener('click', async event => {
  const view=event.target.closest('[data-view]');
  if(view){await navigate(view.dataset.view);return;}
  const t=event.target.closest('[data-action]');
  if(!t || busy)return;
  try {
    switch(t.dataset.action){
      case 'job': await navigate('detail',t.dataset.id);break;
      case 'apply': {
        if(!confirm('Confirmar candidatura nesta vaga?'))return;
        await api(`/api/jobs/${t.dataset.id}/apply`,{method:'POST',data:{}});
        notify('Candidatura enviada com sucesso.');await navigate('my-apps');break;
      }
      case 'candidates': await navigate('candidates',t.dataset.id);break;
      case 'edit-job': await navigate('edit-job',t.dataset.id);break;
      case 'toggle-job': {
        const status=t.dataset.status;
        if(!confirm(`${status==='Encerrada'?'Encerrar':'Reabrir'} esta vaga?`))return;
        await api(`/api/jobs/${t.dataset.id}`,{method:'PATCH',data:{status}});
        notify(`Vaga ${status.toLowerCase()}.`);await navigate('employer');break;
      }
    }
  }catch(e){notify(e.message);}
});
document.addEventListener('change',async event=>{
  const t=event.target;
  if(!t.dataset.statusId)return;
  try { await api(`/api/applications/${t.dataset.statusId}/status`,{method:'PATCH',data:{status:t.value}});notify('Situação atualizada.');}
  catch(e){notify(e.message);await navigate('candidates');}
});
logoutBtn.addEventListener('click',async()=>{
  try {await api('/api/auth/logout',{method:'POST',data:{}});}catch(e){notify(e.message);return;}
  setAuth({user:null,csrf:null});state.filters={q:'',type:''};notify('Você saiu da conta.');await navigate('home');
});
document.querySelector('#logo-link').addEventListener('click',event=>{event.preventDefault();void navigate(state.user?.role==='employer'?'employer':state.user?.role==='candidate'?'jobs':'home');});
(async()=>{
  try {setAuth(await api('/api/auth/me'));}
  catch(e){notify('Não foi possível conectar ao servidor.');}
  await navigate(state.user?.role==='employer'?'employer':state.user?.role==='candidate'?'jobs':'home');
})();
