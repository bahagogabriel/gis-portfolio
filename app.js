const header=document.querySelector('[data-header]');
const toggle=document.querySelector('[data-menu-toggle]');
const nav=document.querySelector('[data-nav]');
const updateHeader=()=>header?.classList.toggle('scrolled',scrollY>24);
updateHeader();
addEventListener('scroll',updateHeader,{passive:true});
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav?.classList.toggle('open',!open)});
nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false')}));

const page=document.body.dataset.page;
document.querySelector(`[data-nav-page="${page}"]`)?.classList.add('active');

const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(element=>revealObserver.observe(element));

const filters=document.querySelectorAll('[data-filter]');
const cards=document.querySelectorAll('[data-category]');
filters.forEach(button=>button.addEventListener('click',()=>{const filter=button.dataset.filter;filters.forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected))});cards.forEach(card=>{const visible=filter==='all'||card.dataset.category.split(' ').includes(filter);card.classList.toggle('hidden',!visible)})}));
