/**
 * gh-sync.js — Drop-in GitHub-backed cloud sync for static web apps.
 *
 * Stores app data as a JSON file in a GitHub repo, using a user-provided
 * fine-grained Personal Access Token (PAT) for auth. Token is kept in
 * localStorage per device. No backend required.
 *
 * USAGE:
 *
 *   <script src="gh-sync.js"></script>
 *   <div id="sync-mount"></div>          <!-- where the chip should appear -->
 *
 *   <script>
 *     const sync = new GhSync({
 *       owner: 'your-username',
 *       repo: 'your-repo',
 *       branch: 'main',
 *       path: 'data/app.json',
 *       appName: 'My App',                // shown in sign-in modal
 *       storagePrefix: 'myapp',           // namespace for localStorage keys
 *       mountChip: '#sync-mount',         // selector or element
 *       merge: (remote, local) => ({...}),// app-specific merge function
 *       buildPayload: () => ({...}),      // returns the data to save
 *       onLoad: (data) => { ... },        // called when remote data is loaded
 *     });
 *
 *     // Trigger sync after any local change:
 *     sync.scheduleSync();
 *   </script>
 *
 * REQUIRED TOKEN PERMISSIONS:
 *   - Repository access: Only select repositories → your repo
 *   - Repository permissions → Contents: Read and write
 *
 * THEME:
 *   The injected CSS uses these CSS variables with fallbacks. Override any
 *   of them on :root to match your app's theme:
 *     --gh-sync-bg, --gh-sync-border, --gh-sync-text, --gh-sync-text-muted,
 *     --gh-sync-input-bg, --gh-sync-input-border, --gh-sync-accent,
 *     --gh-sync-accent-secondary, --gh-sync-success, --gh-sync-warning,
 *     --gh-sync-danger, --gh-sync-shadow, --gh-sync-ghost-bg-hover
 *
 *   Each variable also falls back to similarly named generic vars
 *   (--accent, --card-bg, etc.) if present, so apps that already define
 *   those will integrate automatically.
 */
(function (root) {
    'use strict';

    const STYLE_ID = 'gh-sync-styles';
    const STYLE_CSS = `
        .gh-sync-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-radius: 12px;
            border: 1px solid var(--gh-sync-border, var(--card-border, rgba(255,255,255,0.08)));
            background: var(--gh-sync-bg, var(--card-bg, rgba(22,33,62,0.85)));
            backdrop-filter: blur(20px);
            color: var(--gh-sync-text, var(--text-bright, #c0d0e0));
            cursor: pointer;
            font-size: 0.78rem;
            font-weight: 600;
            font-family: inherit;
            min-height: 44px;
            transition: background 0.2s, color 0.2s;
            white-space: nowrap;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .gh-sync-chip:hover { background: var(--gh-sync-ghost-bg-hover, var(--ghost-bg-hover, rgba(255,255,255,0.08))); }
        .gh-sync-chip .gh-sync-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            background: var(--gh-sync-text-muted, var(--text-muted, #7a8ba8));
        }
        .gh-sync-chip[data-state="signed-out"] .gh-sync-dot { background: var(--gh-sync-text-muted, var(--text-muted, #7a8ba8)); }
        .gh-sync-chip[data-state="syncing"] .gh-sync-dot {
            background: var(--gh-sync-accent, var(--accent, #4a9eff));
            animation: gh-sync-pulse 1s ease-in-out infinite;
        }
        .gh-sync-chip[data-state="synced"] .gh-sync-dot { background: var(--gh-sync-success, var(--credit, #5ce0a0)); }
        .gh-sync-chip[data-state="offline"] .gh-sync-dot { background: var(--gh-sync-warning, var(--cat-bills, #ffb86b)); }
        .gh-sync-chip[data-state="error"] .gh-sync-dot { background: var(--gh-sync-danger, var(--debit, #ff7a90)); }
        @keyframes gh-sync-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @media (max-width: 480px) {
            .gh-sync-chip .gh-sync-label { display: none; }
            .gh-sync-chip { padding: 0; width: 44px; height: 44px; justify-content: center; }
        }

        .gh-sync-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 16px;
            padding-top: max(16px, env(safe-area-inset-top));
            padding-bottom: max(16px, env(safe-area-inset-bottom));
            z-index: 2000;
            backdrop-filter: blur(6px);
        }
        [data-theme="light"] .gh-sync-overlay { background: rgba(15, 23, 42, 0.35); }
        .gh-sync-overlay.show { display: flex; }

        .gh-sync-card {
            background: var(--gh-sync-bg, var(--card-bg, rgba(22,33,62,0.85)));
            backdrop-filter: blur(20px);
            border: 1px solid var(--gh-sync-border, var(--card-border, rgba(255,255,255,0.08)));
            border-radius: 18px;
            padding: 24px;
            max-width: 480px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: var(--gh-sync-shadow, var(--shadow, 0 25px 80px rgba(0,0,0,0.4)));
            color: var(--gh-sync-text, var(--text, #e0e0e0));
            font-family: inherit;
        }
        .gh-sync-card h2 {
            font-size: 1.15rem;
            font-weight: 700;
            margin: 0 0 6px;
        }
        .gh-sync-card .gh-sync-lead {
            font-size: 0.85rem;
            color: var(--gh-sync-text-muted, var(--text-muted, #7a8ba8));
            margin-bottom: 18px;
            line-height: 1.5;
        }
        .gh-sync-card ol {
            font-size: 0.85rem;
            line-height: 1.6;
            padding-left: 22px;
            margin-bottom: 16px;
        }
        .gh-sync-card ol li { margin-bottom: 6px; }
        .gh-sync-card a {
            color: var(--gh-sync-accent, var(--accent, #4a9eff));
            text-decoration: none;
            font-weight: 600;
            word-break: break-all;
        }
        .gh-sync-card a:hover { text-decoration: underline; }
        .gh-sync-card code {
            background: var(--gh-sync-input-bg, var(--input-bg, rgba(15,23,42,0.6)));
            border: 1px solid var(--gh-sync-input-border, var(--input-border, rgba(255,255,255,0.08)));
            border-radius: 4px;
            padding: 1px 6px;
            font-size: 0.82em;
            font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }
        .gh-sync-card .gh-sync-field-label {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--gh-sync-text-muted, var(--text-muted, #7a8ba8));
            margin-bottom: 6px;
        }
        .gh-sync-card input[type="password"] {
            width: 100%;
            background: var(--gh-sync-input-bg, var(--input-bg, rgba(15,23,42,0.6)));
            border: 1px solid var(--gh-sync-input-border, var(--input-border, rgba(255,255,255,0.08)));
            border-radius: 10px;
            padding: 12px;
            color: var(--gh-sync-text, var(--text, #e0e0e0));
            font-size: 16px;
            font-family: ui-monospace, "SF Mono", Menlo, monospace;
            min-height: 44px;
            -webkit-appearance: none;
            appearance: none;
        }
        .gh-sync-card input[type="password"]:focus {
            outline: none;
            border-color: var(--gh-sync-accent, var(--accent, #4a9eff));
        }
        .gh-sync-card .gh-sync-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }
        .gh-sync-card .gh-sync-actions button {
            flex: 1;
            padding: 12px 18px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            font-family: inherit;
            min-height: 44px;
            transition: all 0.2s ease;
        }
        .gh-sync-card .gh-sync-btn-primary {
            background: linear-gradient(135deg,
                var(--gh-sync-accent, var(--accent, #4a9eff)),
                var(--gh-sync-accent-secondary, var(--accent-secondary, #6a5cff))
            );
            color: #fff;
        }
        .gh-sync-card .gh-sync-btn-primary:hover { transform: translateY(-1px); }
        .gh-sync-card .gh-sync-btn-ghost {
            background: var(--gh-sync-ghost-bg, var(--ghost-bg, rgba(255,255,255,0.05)));
            color: var(--gh-sync-text, var(--text-bright, #c0d0e0));
            border: 1px solid var(--gh-sync-border, var(--card-border, rgba(255,255,255,0.08)));
        }
        .gh-sync-card .gh-sync-error {
            color: var(--gh-sync-danger, var(--debit, #ff7a90));
            font-size: 0.82rem;
            margin-top: 10px;
            display: none;
        }
        .gh-sync-card .gh-sync-error.show { display: block; }

        .gh-sync-menu {
            position: fixed;
            background: var(--gh-sync-bg, var(--card-bg, rgba(22,33,62,0.85)));
            backdrop-filter: blur(20px);
            border: 1px solid var(--gh-sync-border, var(--card-border, rgba(255,255,255,0.08)));
            border-radius: 12px;
            padding: 6px;
            box-shadow: var(--gh-sync-shadow, var(--shadow, 0 25px 80px rgba(0,0,0,0.4)));
            min-width: 200px;
            display: none;
            z-index: 1500;
            color: var(--gh-sync-text, var(--text, #e0e0e0));
            font-family: inherit;
        }
        .gh-sync-menu.show { display: block; }
        .gh-sync-menu .gh-sync-menu-item {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: transparent;
            color: inherit;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
            font-family: inherit;
            text-align: left;
        }
        .gh-sync-menu .gh-sync-menu-item:hover {
            background: var(--gh-sync-ghost-bg-hover, var(--ghost-bg, rgba(255,255,255,0.05)));
        }
        .gh-sync-menu .gh-sync-menu-item.danger { color: var(--gh-sync-danger, var(--debit, #ff7a90)); }
        .gh-sync-menu .gh-sync-menu-divider {
            height: 1px;
            background: var(--gh-sync-border, var(--card-border, rgba(255,255,255,0.08)));
            margin: 4px 0;
        }
        .gh-sync-menu .gh-sync-menu-meta {
            padding: 8px 12px;
            font-size: 0.72rem;
            color: var(--gh-sync-text-muted, var(--text-muted, #7a8ba8));
        }
    `;

    function injectStylesOnce() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLE_CSS;
        document.head.appendChild(style);
    }

    function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
    function b64decode(b64) {
        try { return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }
        catch { return atob(b64.replace(/\s/g, '')); }
    }

    function resolveMount(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    }

    class GhSync {
        constructor(opts) {
            if (!opts || !opts.owner || !opts.repo || !opts.path) {
                throw new Error('GhSync: owner, repo, and path are required');
            }
            this.opts = Object.assign({
                branch: 'main',
                appName: 'this app',
                storagePrefix: 'gh_sync',
                apiBase: 'https://api.github.com',
                debounceMs: 400,
                merge: (remote, local) => local,
                buildPayload: () => ({}),
                onLoad: null,
                onSyncStateChange: null,
            }, opts);

            this.TOKEN_KEY = this.opts.storagePrefix + '_gh_token';
            this.USER_KEY = this.opts.storagePrefix + '_gh_user';

            this.state = {
                user: localStorage.getItem(this.USER_KEY) || null,
                sha: null,
                syncing: false,
                dirty: false,
                syncTimer: null,
                lastState: 'signed-out',
            };

            injectStylesOnce();
            this._buildChip();
            this._buildAuthOverlay();
            this._buildMenu();
            this._wireEvents();

            if (this.getToken()) this._initialLoad();
            else this._setState('signed-out');
        }

        // ---------- Public API ----------
        getToken() { return localStorage.getItem(this.TOKEN_KEY); }
        getUser() { return this.state.user; }
        isSignedIn() { return !!this.getToken(); }
        openAuth() { this._openAuth(); }

        signOut() {
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
            this.state.user = null;
            this.state.sha = null;
            this._closeMenu();
            this._setState('signed-out');
        }

        // Schedule a debounced cloud sync. Call this after any local change.
        scheduleSync() {
            if (!this.isSignedIn()) return;
            this.state.dirty = true;
            if (this.state.syncTimer) clearTimeout(this.state.syncTimer);
            this.state.syncTimer = setTimeout(() => {
                this.state.syncTimer = null;
                this.state.dirty = false;
                this._sync();
            }, this.opts.debounceMs);
        }

        // Force an immediate sync.
        syncNow() {
            if (!this.isSignedIn()) return;
            if (this.state.syncTimer) { clearTimeout(this.state.syncTimer); this.state.syncTimer = null; }
            this._sync();
        }

        // ---------- Sync engine ----------
        async _initialLoad() {
            this._setState('syncing');
            try {
                const { sha, data } = await this._fetchRemote();
                this.state.sha = sha;
                const local = this.opts.buildPayload();
                const merged = this.opts.merge(data, local);
                if (typeof this.opts.onLoad === 'function') {
                    this.opts.onLoad(merged, { remoteHadData: !!data });
                }
                // If local had unsynced state, push the merged result so it lands in the cloud
                if (!data || JSON.stringify(merged) !== JSON.stringify(data)) {
                    await this._sync();
                } else {
                    this._setState('synced');
                }
            } catch (e) {
                console.error('GhSync: initial load failed', e);
                if (!navigator.onLine) this._setState('offline');
                else this._setState('error', 'Sync error');
            }
        }

        async _sync() {
            if (!this.isSignedIn()) { this._setState('signed-out'); return; }
            if (!navigator.onLine) { this._setState('offline'); this.state.dirty = true; return; }
            if (this.state.syncing) { this.state.dirty = true; return; }
            this.state.syncing = true;
            this._setState('syncing');
            try {
                const local = this.opts.buildPayload();
                const { sha, data: remote } = await this._fetchRemote();
                const merged = this.opts.merge(remote, local);
                const newSha = await this._putRemote(merged, sha);
                this.state.sha = newSha;
                if (typeof this.opts.onLoad === 'function') {
                    this.opts.onLoad(merged, { remoteHadData: !!remote });
                }
                this._setState('synced');
            } catch (e) {
                if (e && e.status === 409) {
                    this.state.syncing = false;
                    this.state.dirty = true;
                    return setTimeout(() => this._sync(), 200);
                }
                console.error('GhSync: sync failed', e);
                this._setState('error', 'Sync error');
            } finally {
                this.state.syncing = false;
                if (this.state.dirty) {
                    this.state.dirty = false;
                    setTimeout(() => this._sync(), 300);
                }
            }
        }

        async _fetchRemote() {
            const { owner, repo, branch, path } = this.opts;
            const url = `${this.opts.apiBase}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            const res = await this._ghFetch(url);
            if (res.status === 404) return { sha: null, data: null };
            if (!res.ok) throw new Error('Fetch failed (' + res.status + ')');
            const j = await res.json();
            const text = b64decode(j.content || '');
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {}
            return { sha: j.sha, data: parsed };
        }

        async _putRemote(payload, sha) {
            const { owner, repo, branch, path } = this.opts;
            const url = `${this.opts.apiBase}/repos/${owner}/${repo}/contents/${path}`;
            const body = {
                message: `Update ${path} (${new Date().toISOString()})`,
                content: b64encode(JSON.stringify(payload, null, 2)),
                branch,
            };
            if (sha) body.sha = sha;
            const res = await this._ghFetch(url, { method: 'PUT', body: JSON.stringify(body) });
            if (!res.ok) {
                const errText = await res.text();
                const err = new Error('Put failed (' + res.status + '): ' + errText.slice(0, 200));
                err.status = res.status;
                throw err;
            }
            const j = await res.json();
            return j.content && j.content.sha;
        }

        async _ghFetch(url, opts) {
            opts = opts || {};
            const token = this.getToken();
            if (!token) throw new Error('Not signed in');
            return fetch(url, {
                ...opts,
                headers: Object.assign({
                    'Accept': 'application/vnd.github+json',
                    'Authorization': 'Bearer ' + token,
                    'X-GitHub-Api-Version': '2022-11-28',
                }, opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {}),
            });
        }

        async _validateToken(token) {
            const res = await fetch(this.opts.apiBase + '/user', {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': 'Bearer ' + token,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });
            if (!res.ok) {
                if (res.status === 401) throw new Error('Invalid token (401)');
                throw new Error('Validation failed (' + res.status + ')');
            }
            const data = await res.json();
            return data.login;
        }

        // ---------- UI: chip ----------
        _buildChip() {
            const chip = document.createElement('button');
            chip.className = 'gh-sync-chip';
            chip.type = 'button';
            chip.setAttribute('data-state', 'signed-out');
            chip.innerHTML = '<span class="gh-sync-dot"></span><span class="gh-sync-label">Sign in</span>';
            this.chip = chip;
            const mount = resolveMount(this.opts.mountChip);
            if (mount) mount.appendChild(chip);
            else document.body.appendChild(chip);
        }

        _setState(s, label) {
            this.state.lastState = s;
            this.chip.setAttribute('data-state', s);
            const labelEl = this.chip.querySelector('.gh-sync-label');
            const defaults = {
                'signed-out': 'Sign in',
                'syncing': 'Syncing…',
                'synced': this.state.user ? '@' + this.state.user : 'Synced',
                'offline': 'Offline',
                'error': 'Sync error',
            };
            const text = label || defaults[s] || s;
            labelEl.textContent = text;
            this.chip.setAttribute('aria-label', text);
            this.chip.setAttribute('title', text);
            if (typeof this.opts.onSyncStateChange === 'function') {
                this.opts.onSyncStateChange(s, text);
            }
        }

        // ---------- UI: auth overlay ----------
        _buildAuthOverlay() {
            const overlay = document.createElement('div');
            overlay.className = 'gh-sync-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            const { owner, repo, path, appName } = this.opts;
            overlay.innerHTML = `
                <div class="gh-sync-card">
                    <h2>Sync ${escapeHtml(appName)}</h2>
                    <div class="gh-sync-lead">Generate a fine-grained Personal Access Token and paste it below. Data syncs to <code>${escapeHtml(owner)}/${escapeHtml(repo)}</code> at <code>${escapeHtml(path)}</code>.</div>
                    <ol>
                        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
                        <li><strong>Token name:</strong> <code>${escapeHtml(appName)}</code></li>
                        <li><strong>Expiration:</strong> 1 year (or your preference)</li>
                        <li><strong>Repository access:</strong> Only select repositories → <code>${escapeHtml(repo)}</code></li>
                        <li><strong>Permissions → Repository permissions → Contents:</strong> Read and write</li>
                        <li>Click <strong>Generate token</strong>, copy it, paste below</li>
                    </ol>
                    <div class="gh-sync-field-label">Paste token</div>
                    <input type="password" class="gh-sync-token-input" placeholder="github_pat_..." autocomplete="off" spellcheck="false">
                    <div class="gh-sync-error"></div>
                    <div class="gh-sync-actions">
                        <button type="button" class="gh-sync-btn-ghost gh-sync-skip">Skip</button>
                        <button type="button" class="gh-sync-btn-primary gh-sync-connect">Connect</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this.overlay = overlay;
            this.tokenInput = overlay.querySelector('.gh-sync-token-input');
            this.errorEl = overlay.querySelector('.gh-sync-error');
        }

        _openAuth() {
            this.errorEl.classList.remove('show');
            this.tokenInput.value = '';
            this.overlay.classList.add('show');
            setTimeout(() => this.tokenInput.focus(), 50);
        }

        _closeAuth() { this.overlay.classList.remove('show'); }

        async _onConnect() {
            const token = this.tokenInput.value.trim();
            this.errorEl.classList.remove('show');
            if (!token) {
                this.errorEl.textContent = 'Paste a token first.';
                this.errorEl.classList.add('show');
                return;
            }
            const btn = this.overlay.querySelector('.gh-sync-connect');
            btn.disabled = true;
            btn.textContent = 'Checking…';
            try {
                const login = await this._validateToken(token);
                localStorage.setItem(this.TOKEN_KEY, token);
                localStorage.setItem(this.USER_KEY, login);
                this.state.user = login;
                this._closeAuth();
                await this._initialLoad();
            } catch (e) {
                this.errorEl.textContent = e.message || 'Token validation failed';
                this.errorEl.classList.add('show');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Connect';
            }
        }

        // ---------- UI: account menu ----------
        _buildMenu() {
            const menu = document.createElement('div');
            menu.className = 'gh-sync-menu';
            menu.innerHTML = `
                <div class="gh-sync-menu-meta"></div>
                <div class="gh-sync-menu-divider"></div>
                <button class="gh-sync-menu-item gh-sync-menu-sync">🔄 Sync now</button>
                <button class="gh-sync-menu-item danger gh-sync-menu-signout">⏻ Sign out (this device)</button>
            `;
            document.body.appendChild(menu);
            this.menu = menu;
        }

        _positionMenu() {
            const r = this.chip.getBoundingClientRect();
            const menuW = this.menu.offsetWidth || 200;
            this.menu.style.top = (r.bottom + 6) + 'px';
            this.menu.style.left = Math.max(8, Math.min(window.innerWidth - menuW - 8, r.right - menuW)) + 'px';
        }

        _openMenu() {
            this.menu.querySelector('.gh-sync-menu-meta').textContent =
                this.state.user ? `Signed in as @${this.state.user}` : 'Not signed in';
            this.menu.classList.add('show');
            this._positionMenu();
        }

        _closeMenu() { this.menu.classList.remove('show'); }

        // ---------- Event wiring ----------
        _wireEvents() {
            this.chip.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.isSignedIn()) { this._openAuth(); return; }
                if (this.menu.classList.contains('show')) this._closeMenu();
                else this._openMenu();
            });

            this.overlay.querySelector('.gh-sync-skip').addEventListener('click', () => this._closeAuth());
            this.overlay.querySelector('.gh-sync-connect').addEventListener('click', () => this._onConnect());
            this.tokenInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._onConnect();
            });
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this._closeAuth();
            });

            this.menu.querySelector('.gh-sync-menu-sync').addEventListener('click', () => {
                this._closeMenu();
                this.syncNow();
            });
            this.menu.querySelector('.gh-sync-menu-signout').addEventListener('click', () => {
                if (!confirm('Sign out on this device? Local data stays; the token is removed from this browser.')) return;
                this.signOut();
            });

            document.addEventListener('click', (e) => {
                if (!this.menu.contains(e.target) && e.target !== this.chip) this._closeMenu();
            });

            window.addEventListener('online', () => { if (this.isSignedIn()) this._sync(); });
            window.addEventListener('offline', () => { if (this.isSignedIn()) this._setState('offline'); });
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    root.GhSync = GhSync;
})(window);
