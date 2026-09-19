const header=document.querySelector('[data-header]');
const toggle=document.querySelector('[data-menu-toggle]');
const nav=document.querySelector('[data-nav]');
const updateHeader=()=>header?.classList.toggle('scrolled',scrollY>24);
updateHeader();
addEventListener('scroll',updateHeader,{passive:true});
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav?.classList.toggle('open',!open)});
nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false')}));

const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(element=>revealObserver.observe(element));

const lightbox=document.querySelector('[data-lightbox-dialog]');
const lightboxImage=lightbox?.querySelector('[data-lightbox-image]');
const lightboxCaption=lightbox?.querySelector('[data-lightbox-caption]');
document.querySelectorAll('[data-lightbox]').forEach(button=>button.addEventListener('click',()=>{if(!lightbox)return;lightboxImage.src=button.dataset.lightbox;lightboxImage.alt=button.querySelector('img')?.alt||'';lightboxCaption.textContent=button.dataset.caption||'';lightbox.showModal()}));
lightbox?.querySelector('[data-lightbox-close]')?.addEventListener('click',()=>lightbox.close());
lightbox?.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lightbox?.open)lightbox.close()});
