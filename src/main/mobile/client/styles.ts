// CSS do app mobile (conteúdo entre <style> e </style>).
export const STYLES = `    :root {
      --bg: #09090b;
      --surface: #121110;
      --card: #18181b;
      --card-hover: #222226;
      --border: #27272a;
      --border-focus: #f97316;
      --fg: #fafafa;
      --muted: #a1a1aa;
      --accent: #f97316;
      --accent-muted: rgba(249, 115, 22, 0.15);
      --success: #10b981;
      --success-muted: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-muted: rgba(245, 158, 11, 0.15);
      --decision-approved: #15803d;
      --decision-revision: #b91c1c;
      --error: #ef4444;
      --error-muted: rgba(239, 68, 68, 0.15);
      --radius: 12px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --mono: "SF Mono", "Fira Code", Consolas, Menlo, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 15px;
      line-height: 1.45;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    button, input, select, textarea {
      font-family: inherit;
      color: inherit;
    }
    button {
      cursor: pointer;
      border: none;
      background: transparent;
      touch-action: manipulation;
    }

    /* Top Bar */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(9, 9, 11, 0.94);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 10px 16px;
      padding-top: calc(10px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .brand > div:last-child {
      min-width: 0;
    }
    .brand-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.35);
    }
    .brand-title {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .btn-create-top {
      background: var(--accent);
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      padding: 6px 12px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
    }
    .live-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--card);
      border: 1px solid var(--border);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--muted);
    }
    .live-dot.connected {
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }
    .live-dot.warn {
      background: var(--warning);
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.15); }
    }

    /* Main Container */
    .app-main {
      flex: 1;
      padding: 16px;
      padding-bottom: calc(64px + env(safe-area-inset-bottom) + 28px);
      max-width: 640px;
      width: 100%;
      margin: 0 auto;
    }

    /* Auth Screen */
    .auth-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 140px);
      min-height: calc(100dvh - 140px);
      padding: 24px 16px;
      text-align: center;
    }
    .auth-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 20px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .auth-logo {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(249, 115, 22, 0.4);
    }
    .auth-card h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .auth-card p {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .pin-grid {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .pin-box {
      width: 46px;
      height: 56px;
      background: var(--surface);
      border: 2px solid var(--border);
      border-radius: 12px;
      font-family: var(--mono);
      font-size: 24px;
      font-weight: 700;
      color: var(--accent);
      text-align: center;
      text-transform: uppercase;
      outline: none;
      transition: all 0.15s ease;
    }
    .pin-box:focus {
      border-color: var(--accent);
      background: #000;
      box-shadow: 0 0 0 3px var(--accent-muted);
    }
    .btn-primary {
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      background: var(--accent);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .btn-primary:active {
      transform: scale(0.98);
      background: #ea580c;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .auth-error {
      margin-top: 14px;
      padding: 10px 14px;
      background: var(--error-muted);
      border: 1px solid var(--error);
      color: #fca5a5;
      border-radius: 10px;
      font-size: 13px;
      animation: shake 0.3s;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-6px); }
      40%, 80% { transform: translateX(6px); }
    }

    /* Cards & Sections */
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
      margin-bottom: 14px;
    }

    /* Live Jobs Card */
    .job-card {
      border-left: 4px solid var(--border);
      transition: border-color 0.2s ease, transform 0.1s ease;
    }
    .job-card:active {
      transform: scale(0.99);
    }
    .job-card.running {
      border-left-color: var(--accent);
      background: linear-gradient(90deg, rgba(249, 115, 22, 0.06) 0%, var(--card) 100%);
    }
    .job-card.succeeded { border-left-color: var(--success); }
    .job-card.failed { border-left-color: var(--error); }
    .job-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }
    .job-title {
      font-weight: 600;
      font-size: 15px;
      color: var(--fg);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .status-badge.running { background: var(--accent-muted); color: var(--accent); }
    .status-badge.succeeded { background: var(--success-muted); color: var(--success); }
    .status-badge.failed { background: var(--error-muted); color: var(--error); }
    .status-badge.cancelled { background: rgba(161, 161, 170, 0.15); color: var(--muted); }
    .job-activity {
      font-size: 13px;
      color: var(--accent);
      background: var(--accent-muted);
      padding: 6px 10px;
      border-radius: 8px;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .job-meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }

    /* Interactive Alert Box */
    .interaction-box {
      background: #1e1915;
      border: 1px solid var(--accent);
      border-radius: var(--radius);
      padding: 14px;
      margin-bottom: 14px;
      animation: pulseBorder 2s infinite alternate;
    }
    @keyframes pulseBorder {
      0% { border-color: var(--accent); box-shadow: 0 0 10px rgba(249, 115, 22, 0.2); }
      100% { border-color: #fb923c; box-shadow: 0 0 16px rgba(249, 115, 22, 0.4); }
    }
    .interaction-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .interaction-code {
      font-family: var(--mono);
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #fff;
      background: #000;
      padding: 10px;
      border-radius: 8px;
      text-align: center;
      margin: 10px 0;
      user-select: all;
    }
    .interaction-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .btn-sm {
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn-accent { background: var(--accent); color: #fff; }
    .btn-secondary { background: var(--surface); border: 1px solid var(--border); color: var(--fg); }

    /* Live Terminal Container */
    .terminal-container {
      background: #000;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.5;
      color: #e4e4e7;
      max-height: 320px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 8px;
    }
    .terminal-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .terminal-controls label {
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Projects Grid & Cards */
    .filter-pills {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
      margin-bottom: 12px;
      scrollbar-width: none;
    }
    .filter-pill {
      padding: 6px 14px;
      border-radius: 999px;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .filter-pill.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      font-weight: 600;
    }
    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .project-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      display: flex;
      gap: 14px;
      align-items: center;
      transition: border-color 0.15s ease;
    }
    .project-card:active {
      border-color: var(--accent);
      background: var(--card-hover);
    }
    .project-thumb {
      width: 68px;
      height: 68px;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .project-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .project-info {
      flex: 1;
      min-width: 0;
    }
    .project-title {
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .project-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .tag {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .tag.kind-image { color: #38bdf8; border-color: rgba(56, 189, 248, 0.2); }
    .tag.kind-video { color: #a855f7; border-color: rgba(168, 85, 247, 0.2); }

    /* Project Detail View */
    .detail-view {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--accent);
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .detail-header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .detail-header h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .detail-brief {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.5;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }

    /* Workflow Actions Bar */
    .workflow-actions-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
    }
    .workflow-actions-title {
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .workflow-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    /* Step Bar & Journey Navigation */
    .step-bar-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 10px;
      overflow-x: auto;
      white-space: nowrap;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .step-bar-container::-webkit-scrollbar { display: none; }
    .step-bar {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .step-pill.current {
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      border-color: var(--accent);
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.35);
    }
    .step-pill.done {
      background: var(--surface);
      border-color: var(--success);
      color: var(--success);
    }
    .step-pill.running {
      border-color: var(--warning);
      color: var(--warning);
      animation: pulse 1.5s infinite;
    }
    .step-pill.selected-view {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    /* Step Shell */
    .step-shell {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .step-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .step-shell-title {
      font-size: 17px;
      font-weight: 700;
      margin-top: 2px;
    }
    .step-shell-desc {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.45;
    }
    .step-alert {
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .step-alert.warning {
      background: var(--warning-muted);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }
    .step-alert.success {
      background: var(--success-muted);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .step-alert.info {
      background: var(--accent-muted);
      border: 1px solid rgba(249, 115, 22, 0.3);
      color: #fdba74;
    }
    .step-alert.error {
      background: var(--error-muted);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    /* Page Cards & Fields (Visual Text Editor) */
    .page-cards-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .page-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .page-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 700;
      color: var(--fg);
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .page-card-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--card);
      color: var(--muted);
    }
    .input-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 4px;
      display: block;
    }
    .input-headline {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--fg);
      outline: none;
    }
    .input-headline:focus { border-color: var(--accent); }
    .input-copy {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 13px;
      color: var(--fg);
      outline: none;
      resize: vertical;
      min-height: 60px;
      line-height: 1.4;
    }
    .input-copy:focus { border-color: var(--accent); }
    .select-person {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--fg);
      outline: none;
    }

    /* Scene Cards (Video Storyboard) */
    .scene-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .scene-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 700;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .scene-meta {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.4;
    }

    /* Review Item Cards */
    .review-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .review-item-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .review-item-img {
      width: 100%;
      aspect-ratio: 1;
      background: #000;
      object-fit: cover;
      cursor: pointer;
    }
    .review-item-meta {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .review-item-status {
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .decision-chip.is-kept { color: #4ade80; }
    .decision-chip.is-redo { color: #f87171; }
    .decision-chip.is-pending { color: var(--muted); }
    .review-action-btn-group {
      display: flex;
      gap: 6px;
    }
    .btn-review-keep {
      flex: 1;
      padding: 6px 8px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg);
      text-align: center;
    }
    .btn-review-keep.active {
      background: var(--decision-approved);
      color: #fff;
      border-color: #4ade80;
    }
    .btn-review-redo {
      flex: 1;
      padding: 6px 8px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg);
      text-align: center;
    }
    .btn-review-redo.active {
      background: var(--decision-revision);
      color: #fff;
      border-color: #f87171;
    }
    .btn-review-keep:disabled, .btn-review-redo:disabled { opacity: 0.5; cursor: not-allowed; }
    .redo-note {
      width: 100%;
      font-size: 12px;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--fg);
      resize: vertical;
    }
    .btn-link-secondary {
      display: block;
      margin: 12px auto 0;
      background: none;
      border: none;
      color: var(--muted);
      font-size: 12px;
      text-decoration: underline;
      cursor: pointer;
    }

    /* Step Navigation Footer */
    .step-nav-footer {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-top: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .btn-step-prev {
      flex: 1;
      padding: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn-step-next {
      flex: 2;
      padding: 10px;
      background: var(--accent);
      color: #fff;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.35);
      transition: all 0.15s ease;
    }
    .btn-step-next:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
      background: var(--surface);
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .step-hint-text {
      font-size: 11px;
      color: var(--muted);
      text-align: center;
      margin-top: 4px;
    }

    /* Prompt Command Box */
    .agent-prompt-box {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    .agent-prompt-input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      font-size: 13px;
      color: var(--fg);
      margin-bottom: 8px;
      outline: none;
      resize: vertical;
      min-height: 54px;
    }
    .agent-prompt-input:focus {
      border-color: var(--accent);
    }

    /* Media Gallery */
    .assets-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 12px;
    }
    .asset-item {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .asset-media-preview {
      width: 100%;
      aspect-ratio: 1;
      background: #000;
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }
    .asset-media-preview img, .asset-media-preview video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .asset-meta {
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .asset-name {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .asset-download {
      color: var(--accent);
      padding: 4px;
      border-radius: 6px;
    }

    /* Creation Modal & Forms */
    .create-type-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }
    .create-type-btn {
      background: var(--surface);
      border: 2px solid var(--border);
      border-radius: 12px;
      padding: 14px 10px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .create-type-btn.selected {
      border-color: var(--accent);
      background: var(--accent-muted);
      color: var(--accent);
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .form-control {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      color: var(--fg);
      outline: none;
    }
    .form-control:focus {
      border-color: var(--accent);
    }

    /* Lightbox Modal */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 100;
      display: flex;
      flex-direction: column;
      padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
    }
    .modal-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      color: #fff;
    }
    .modal-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .modal-content img, .modal-content video {
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 8px;
    }
    .modal-sheet {
      background: var(--card);
      border-top: 1px solid var(--border);
      border-radius: 20px 20px 0 0;
      padding: 20px 16px;
      margin-top: auto;
      max-height: 90vh;
      overflow-y: auto;
    }

    /* Bottom Navigation */
    .bottom-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 50;
      background: rgba(18, 17, 16, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom);
      display: flex;
      justify-content: space-around;
      align-items: center;
      height: calc(64px + env(safe-area-inset-bottom));
    }
    .nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
      padding: 6px 0;
      height: 100%;
      transition: color 0.15s ease;
    }
    .nav-item.active {
      color: var(--accent);
      font-weight: 700;
    }
    .nav-item svg {
      width: 22px;
      height: 22px;
    }

    /* QR Code & System Info */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: var(--muted); }
    .info-value { font-family: var(--mono); font-weight: 600; color: var(--fg); }
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: #fff;
      border-radius: 14px;
      margin: 16px auto;
      max-width: 220px;
    }
    .qr-container svg {
      width: 200px;
      height: 200px;
    }

    /* Layout: 100dvh, entradas >= 16px (sem zoom no iOS), alvos >= 44px */
    .app-main input:not([type=checkbox]):not([type=radio]),
    .app-main textarea,
    .app-main select,
    .modal-sheet input:not([type=checkbox]):not([type=radio]),
    .modal-sheet textarea,
    .modal-sheet select,
    .confirm-sheet textarea,
    .confirm-sheet input {
      font-size: 16px;
    }
    .btn-primary, .btn-step-prev, .btn-step-next, .btn-create-top, .back-btn, .confirm-actions button, .interaction-actions .btn-sm, .interaction-actions input {
      min-height: 44px;
    }
    .btn-create-top { padding: 6px 14px; }
    .modal-sheet { max-height: 90vh; max-height: 90dvh; }
    .modal-content img, .modal-content video { max-height: 80vh; max-height: 80dvh; }

    /* Foco visível */
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [data-act]:focus-visible, [tabindex]:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .pin-box:focus-visible { outline-offset: 0; }

    /* Faixa offline / atualização pendente */
    .offline-banner {
      position: sticky;
      top: calc(52px + env(safe-area-inset-top));
      z-index: 39;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--warning-muted);
      border-bottom: 1px solid var(--warning);
      color: #fcd34d;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
    }
    .offline-banner.visible { display: flex; }
    .stale-banner {
      width: 100%;
      margin-bottom: 12px;
      padding: 12px 14px;
      min-height: 44px;
      border-radius: var(--radius);
      border: 1px solid var(--accent);
      background: var(--accent-muted);
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      text-align: center;
    }

    /* Toast */
    .toast-host {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
      z-index: 130;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      max-width: 420px;
      padding: 10px 16px;
      background: #27272a;
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--fg);
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      animation: toastIn 0.2s ease;
    }
    .toast.error { border-color: var(--error); background: #2a1414; color: #fca5a5; }
    @keyframes toastIn {
      0% { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    /* Confirmação de custo (folha na própria página) */
    .confirm-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 120;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      background: rgba(0, 0, 0, 0.7);
    }
    .confirm-sheet {
      background: var(--card);
      border-top: 1px solid var(--border);
      border-radius: 20px 20px 0 0;
      padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
      max-width: 640px;
      width: 100%;
      margin: 0 auto;
    }
    .confirm-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    .confirm-text { font-size: 14px; color: var(--fg); line-height: 1.5; margin-bottom: 16px; white-space: pre-line; }
    .confirm-actions { display: flex; gap: 10px; }
    .confirm-actions button {
      flex: 1;
      padding: 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
    }
    .confirm-actions .confirm-cancel { background: var(--surface); border: 1px solid var(--border); color: var(--fg); }
    .confirm-actions .confirm-ok { background: var(--accent); color: #fff; }

    /* Interação do agente: opções e senha */
    .interaction-choices { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .interaction-input { width: 100%; margin-top: 10px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--fg); }
    .job-label { font-family: var(--mono); font-size: 10px; color: var(--accent); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
    }

    .media-missing {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 64px;
      padding: 8px;
      background: var(--surface);
      border: 1px dashed var(--border);
      border-radius: 8px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    .project-thumb .media-missing { min-height: 0; height: 100%; border: none; border-radius: 0; font-size: 0; }
    .qr-container img { width: 200px; height: 200px; }
`;
