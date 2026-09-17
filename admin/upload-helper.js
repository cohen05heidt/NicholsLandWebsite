/*
 * Upload helper for the Nichols Land listings admin.
 *
 * Loaded by admin/index.html before Sveltia CMS. It closes two gaps that made
 * "add a property with photos" fail:
 *
 * 1. Any file size. Sveltia saves through GitHub's GraphQL
 *    createCommitOnBranch, which carries every file inline in one request.
 *    GitHub refuses those requests somewhere around 10 MB ("Failed to send
 *    the request" / "Failed to fetch"). When a save is that large, this sends
 *    the same commit through GitHub's Git Data REST API instead, one file at
 *    a time (up to 100 MB each), and hands Sveltia the answer it expects.
 *    Small saves are untouched.
 *
 * 2. Any photo type. BMP, JFIF and other image types a browser can open are
 *    redrawn as JPEG when picked, so Sveltia shrinks them to WebP like any
 *    other photo. HEIC/HEIF/TIFF (which no browser can open) are let through
 *    the file pickers and converted by the build workflow on GitHub.
 *
 * No third-party code is loaded: this page holds the GitHub sign-in.
 *
 * The GitHub token is the one Sveltia already sends; it is only ever sent
 * back to api.github.com.
 */
(() => {
  'use strict';

  /* ---------------------------------------------------------------- 1 --- */

  const nativeFetch = window.fetch.bind(window);
  // Base64 inflates a file by a third; keep well under GitHub's cut-off.
  const INLINE_LIMIT = 6 * 1024 * 1024;

  const graphqlError = (message) =>
    new Response(JSON.stringify({ errors: [{ message }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  async function commitViaRest(init, payload) {
    const input = payload.variables.input;
    const [owner, repo] = input.branch.repositoryNameWithOwner.split('/');
    const branch = input.branch.branchName;
    const headers = new Headers(init.headers || {});
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Content-Type', 'application/json');

    const api = async (path, method = 'GET', data) => {
      const res = await nativeFetch(
        `https://api.github.com/repos/${owner}/${repo}${path}`,
        { method, headers, body: data === undefined ? undefined : JSON.stringify(data) },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`${json.message || res.statusText} (${method} ${path.split('?')[0]}, ${res.status})`);
      }
      return json;
    };

    const additions = input.fileChanges?.additions || [];
    const deletions = input.fileChanges?.deletions || [];
    const head = input.expectedHeadOid;

    const parent = await api(`/git/commits/${head}`);
    const tree = [];
    const blobShas = [];
    for (const file of additions) {
      const blob = await api('/git/blobs', 'POST', { content: file.contents, encoding: 'base64' });
      blobShas.push(blob.sha);
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const file of deletions) {
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
    }
    const newTree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
    const message = [input.message?.headline, input.message?.body].filter(Boolean).join('\n\n');
    const commit = await api('/git/commits', 'POST', {
      message, tree: newTree.sha, parents: [head],
    });
    // Not forced: if someone else saved in the meantime this fails, exactly
    // as expectedHeadOid would have, and Sveltia asks to try again.
    await api(`/git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', {
      sha: commit.sha, force: false,
    });

    // Answer in the shape of the query Sveltia sent, including the
    // `file_N: file(path: "...") { oid }` aliases it uses to track blobs.
    const result = { oid: commit.sha, committedDate: commit.committer?.date };
    const alias = /(\w+)\s*:\s*file\(\s*path\s*:\s*("(?:[^"\\]|\\.)*")\s*\)/g;
    for (const [, name, quoted] of payload.query.matchAll(alias)) {
      const path = JSON.parse(quoted);
      const i = additions.findIndex((a) => a.path === path);
      result[name] = i >= 0 ? { oid: blobShas[i] } : null;
    }
    return new Response(
      JSON.stringify({ data: { createCommitOnBranch: { commit: result } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  window.fetch = async (resource, init) => {
    try {
      const url = typeof resource === 'string' ? resource : resource?.url || '';
      const body = init?.body;
      if (
        url.startsWith('https://api.github.com/graphql')
        && typeof body === 'string'
        && body.length > INLINE_LIMIT
        && body.includes('createCommitOnBranch')
      ) {
        const payload = JSON.parse(body);
        try {
          return await commitViaRest(init, payload);
        } catch (err) {
          console.error('[upload-helper] large save failed', err);
          return graphqlError(`The upload could not be saved: ${err.message}. Please try again.`);
        }
      }
    } catch (err) {
      console.error('[upload-helper]', err);
    }
    return nativeFetch(resource, init);
  };

  /* ---------------------------------------------------------------- 2 --- */

  // Formats a browser can open but a web page should not serve (BMP, JFIF,
  // ICO...) are redrawn as JPEG here, using only the browser itself. HEIC,
  // HEIF and TIFF cannot be opened by a browser at all; they upload as they
  // are and the "Build listing data" workflow converts them on GitHub
  // (tools/convert-heic.py), then points the listing at the converted file.
  const WEB_READY = /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/;
  const SERVER_SIDE = /\.(heic|heif|tiff?)$/i;
  const needsConversion = (file) =>
    (file.type || '').startsWith('image/')
    && !WEB_READY.test(file.type)
    && !SERVER_SIDE.test(file.name)
    || /\.jfif$/i.test(file.name);

  const MAX_SIDE = 4096; // Sveltia takes it on to 2048 from here.
  async function convert(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.92,
    ));
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  }

  const convertAll = (files) => Promise.all(files.map(async (f) => {
    if (!needsConversion(f)) return f;
    try {
      return await convert(f);
    } catch (err) {
      console.warn('[upload-helper] could not convert', f.name, err);
      return f;
    }
  }));

  const listOf = (files) => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    return dt;
  };

  const REPLAYED = Symbol('upload-helper');

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (event[REPLAYED] || !(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const files = [...(input.files || [])];
    if (!files.some(needsConversion)) return;
    event.stopImmediatePropagation();
    convertAll(files).then((converted) => {
      input.files = listOf(converted).files;
      const again = new Event('change', { bubbles: true });
      again[REPLAYED] = true;
      input.dispatchEvent(again);
    });
  }, true);

  // Let the file pickers list these formats; left alone, most computers hide
  // HEIC and TIFF files when the picker asks for images.
  const EXTRA = ',image/heic,image/heif,.heic,.heif,image/tiff,.tif,.tiff,image/bmp,.bmp,.jfif';
  const widen = (root) => {
    root.querySelectorAll?.('input[type=file][accept*="image/"]').forEach((input) => {
      if (!input.accept.includes('image/heic')) input.accept += EXTRA;
    });
  };
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && widen(n.parentNode || n));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
