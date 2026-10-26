export function resolveRoute(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'home' };
  if (clean === '/explore') return { name: 'explore' };
  if (clean === '/start') return { name: 'start' };
  if (clean === '/about') return { name: 'about' };
  if (clean === '/privacy') return { name: 'privacy' };
  const receipt = clean.match(/^\/proof\/([^/]+)\/receipt$/);
  if (receipt) return { name: 'receipt', id: receipt[1] };
  const proof = clean.match(/^\/proof\/([^/]+)$/);
  if (proof) return { name: 'proof', id: proof[1] };
  const project = clean.match(/^\/project\/([^/]+)$/);
  if (project) return { name: 'project', id: project[1] };
  return { name: 'not-found' };
}

export function statusTone(status) {
  if (status === 'proven') return 'green';
  if (status === 'not-proven') return 'coral';
  return 'blue';
}
