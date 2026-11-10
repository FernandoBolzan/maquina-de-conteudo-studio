export function getMobileHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Máquina Mobile">
  <title>Máquina de Conteúdo — Acesso Mobile</title>
  <style>
    :root {
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
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
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
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
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
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
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
      padding-bottom: 90px;
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
      min-height: calc(100vh - 80px);
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
    .review-item-status.kept { color: var(--success); }
    .review-item-status.redo { color: var(--warning); }
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
      background: var(--success);
      color: #fff;
      border-color: var(--success);
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
      background: var(--warning);
      color: #000;
      border-color: var(--warning);
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
  </style>
</head>
<body>
  <!-- Top Bar -->
  <header class="top-bar">
    <div class="brand">
      <div class="brand-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div>
        <div class="brand-title">Máquina Mobile</div>
      </div>
    </div>
    <div class="top-actions">
      <button id="topCreateBtn" class="btn-create-top" style="display: none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Criar</span>
      </button>
      <div id="livePill" class="live-pill">
        <span id="liveDot" class="live-dot"></span>
        <span id="liveText">Desconectado</span>
      </div>
    </div>
  </header>

  <!-- Main View Area -->
  <main id="appMain" class="app-main">
    <!-- View 1: Auth Screen -->
    <div id="authView" class="auth-view" style="display: none;">
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h1>Acesso Remoto</h1>
        <p>Digite o token alfanumérico de 6 dígitos exibido no Studio ou terminal do computador para parear seu celular.</p>

        <form id="authForm">
          <div class="pin-grid">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" autofocus data-idx="0">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" data-idx="1">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" data-idx="2">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" data-idx="3">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" data-idx="4">
            <input type="text" class="pin-box" maxlength="1" autocomplete="off" data-idx="5">
          </div>
          <button type="submit" id="authSubmitBtn" class="btn-primary">
            <span>Conectar e Acessar</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </form>
        <div id="authError" class="auth-error" style="display: none;"></div>
      </div>
    </div>

    <!-- View 2: Live Monitor -->
    <div id="liveView" style="display: none;">
      <div id="interactionContainer"></div>

      <div class="section-title">
        <span>Tarefas em Andamento</span>
        <span id="activeJobsCount" class="tag">0 ativas</span>
      </div>
      <div id="runningJobsList"></div>

      <div class="section-title" style="margin-top: 20px;">
        <span>Terminal ao Vivo</span>
        <div class="terminal-controls">
          <label><input type="checkbox" id="autoScrollCheck" checked> Auto-scroll</label>
        </div>
      </div>
      <div id="terminalStream" class="terminal-container">Aguardando saída dos processos...</div>

      <div class="section-title" style="margin-top: 24px;">
        <span>Histórico Recente</span>
        <button id="refreshJobsBtn" class="btn-sm btn-secondary" style="padding: 2px 8px; font-size: 11px;">Atualizar</button>
      </div>
      <div id="recentJobsList"></div>
    </div>

    <!-- View 3: Projects & Files -->
    <div id="projectsView" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div class="filter-pills" style="margin-bottom: 0;">
          <button class="filter-pill active" data-filter="all">Todos</button>
          <button class="filter-pill" data-filter="image">Carrosséis</button>
          <button class="filter-pill" data-filter="video">Vídeos</button>
        </div>
        <button id="openCreateBtn" class="btn-sm btn-accent" style="white-space: nowrap;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Novo</span>
        </button>
      </div>
      <div id="projectsList" class="projects-list"></div>
    </div>

    <!-- View 4: Project Detail & Workflows (Studio Journey) -->
    <div id="projectDetailView" class="detail-view" style="display: none;">
      <button id="backToProjectsBtn" class="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>Voltar para Projetos</span>
      </button>

      <div class="detail-header">
        <h2 id="detailTitle">Título do Projeto</h2>
        <div id="detailBadges" class="project-badges"></div>
      </div>

      <!-- Step Indicator Bar -->
      <div class="step-bar-container">
        <div id="detailStepBar" class="step-bar"></div>
      </div>

      <!-- Active Step Shell -->
      <div id="detailStepShell" class="step-shell"></div>

      <!-- Quick AI instruction box -->
      <div class="workflow-actions-card">
        <div class="workflow-actions-title">Instrução Rápida com IA</div>
        <div class="agent-prompt-box" style="margin-top: 0; padding-top: 0; border-top: none;">
          <textarea id="agentPromptText" class="agent-prompt-input" placeholder="Instrução direta para a IA (ex: 'mude a headline do slide 2', 'reescreva o gancho')..."></textarea>
          <button id="sendAgentPromptBtn" class="btn-sm btn-accent" style="width: 100%;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Enviar Instrução ao Agente</span>
          </button>
        </div>
      </div>

      <div class="section-title">
        <span>Arquivos do Projeto</span>
        <span id="detailAssetCount" class="tag">0 arquivos</span>
      </div>
      <div id="detailAssetsGrid" class="assets-grid"></div>
    </div>

    <!-- View 5: Connection & Tunnel Info -->
    <div id="connView" style="display: none;">
      <div class="section-title">Status da Conexão</div>
      <div class="card">
        <div class="info-row">
          <span class="info-label">Túnel Remoto</span>
          <span id="connTunnelStatus" class="info-value">Cloudflare Tunnel Ativo</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL Pública</span>
          <span id="connUrl" class="info-value" style="font-size: 11px;">-</span>
        </div>
        <div class="info-row">
          <span class="info-label">Token 6 Dígitos</span>
          <span id="connToken" class="info-value" style="color: var(--accent);">-</span>
        </div>
        <div class="info-row">
          <span class="info-label">Pasta Workspace</span>
          <span id="connWorkspace" class="info-value" style="font-size: 11px;">-</span>
        </div>
        <div class="info-row">
          <span class="info-label">Versão</span>
          <span id="connVersion" class="info-value">-</span>
        </div>
      </div>

      <div class="section-title" style="margin-top: 20px;">QR Code de Acesso</div>
      <div class="card" style="text-align: center;">
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">Escaneie com outro dispositivo para acessar este mesmo painel:</p>
        <div id="qrContainer" class="qr-container">Carregando QR Code...</div>
      </div>

      <button id="logoutBtn" class="btn-primary" style="margin-top: 20px; background: #27272a;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Desconectar deste Celular</span>
      </button>
    </div>
  </main>

  <!-- Create Project Modal -->
  <div id="createProjectModal" class="modal-overlay" style="display: none;">
    <div class="modal-sheet">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Criar Novo Conteúdo</h2>
        <button id="closeCreateModalBtn" style="color: var(--muted); padding: 4px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <form id="createProjectForm">
        <!-- Tipo de Conteúdo -->
        <div class="create-type-grid">
          <div id="typeImageBtn" class="create-type-btn selected" onclick="window.selectCreateKind('image')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <strong style="font-size: 13px;">Carrossel / Post</strong>
            <span style="font-size: 11px; color: var(--muted);">PostNow + Codex</span>
          </div>
          <div id="typeVideoBtn" class="create-type-btn" onclick="window.selectCreateKind('video')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            <strong style="font-size: 13px;">Vídeo Curto</strong>
            <span style="font-size: 11px; color: var(--muted);">VideoGo + Claude</span>
          </div>
        </div>

        <!-- Formato -->
        <div class="form-group">
          <label>Formato do Conteúdo</label>
          <select id="createFormat" class="form-control">
            <option value="carousel-1x1">Carrossel Quadrado 1:1 (Feed)</option>
            <option value="carousel-4x5">Carrossel Vertical 4:5 (Instagram)</option>
            <option value="post-1x1">Post Quadrado 1:1</option>
            <option value="post-4x5">Post Vertical 4:5</option>
            <option value="story-9x16">Story Estático 9:16</option>
          </select>
        </div>

        <!-- Páginas (se carrossel) -->
        <div id="pageCountGroup" class="form-group">
          <label>Quantidade de Slides (Carrossel)</label>
          <select id="createPages" class="form-control">
            <option value="5">5 slides (Recomendado)</option>
            <option value="3">3 slides (Mínimo)</option>
            <option value="4">4 slides</option>
            <option value="6">6 slides</option>
            <option value="7">7 slides</option>
            <option value="8">8 slides</option>
            <option value="9">9 slides</option>
            <option value="10">10 slides (Completo)</option>
          </select>
        </div>

        <!-- Modelo / Template de Conteúdo -->
        <div class="form-group">
          <label>Modelo de Conteúdo (Biblioteca de Prompts)</label>
          <select id="createRecipe" class="form-control">
            <option value="custom">✏️ Personalizado (Livre)</option>
          </select>
        </div>
        <!-- Tema / Assunto -->
        <div class="form-group">
          <label>Tema / Assunto Principal</label>
          <textarea id="createTopic" class="form-control" rows="2" placeholder="Ex: 5 erros comuns ao tentar emagrecer e como evitar..." required></textarea>
        </div>

        <!-- Título -->
        <div class="form-group">
          <label>Título do Projeto</label>
          <input type="text" id="createTitle" class="form-control" placeholder="Ex: Carrossel - 5 Erros no Emagrecimento">
        </div>

        <!-- Público & Tom -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Público-alvo</label>
            <input type="text" id="createAudience" class="form-control" value="Público geral">
          </div>
          <div class="form-group">
            <label>Tom de Voz</label>
            <input type="text" id="createTone" class="form-control" value="Direto e prático">
          </div>
        </div>

        <!-- CTA -->
        <div class="form-group">
          <label>Chamada para Ação (CTA)</label>
          <input type="text" id="createCta" class="form-control" value="Salve e compartilhe este post">
        </div>

        <!-- Checkbox Auto-start -->
        <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin: 14px 0;">
          <input type="checkbox" id="createAutoStart" checked style="width: 18px; height: 18px; accent-color: var(--accent);">
          <label for="createAutoStart" style="margin-bottom: 0; font-size: 13px; color: var(--fg); cursor: pointer;">
            Iniciar agente de IA imediatamente após criar
          </label>
        </div>

        <button type="submit" id="submitCreateBtn" class="btn-primary" style="margin-top: 10px;">
          <span>🚀 Criar e Iniciar Produção</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Lightbox Modal -->
  <div id="lightboxModal" class="modal-overlay" style="display: none;">
    <div class="modal-bar">
      <span id="lightboxTitle" style="font-size: 13px; font-weight: 600;">Visualização</span>
      <div style="display: flex; gap: 12px; align-items: center;">
        <a id="lightboxDownloadBtn" download class="btn-sm btn-accent" style="padding: 4px 10px; font-size: 12px; text-decoration: none;">Download</a>
        <button id="lightboxCloseBtn" style="color: #fff; padding: 4px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div id="lightboxContent" class="modal-content"></div>
  </div>

  <!-- Bottom Navigation -->
  <nav id="bottomNav" class="bottom-nav" style="display: none;">
    <button class="nav-item active" data-tab="live">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
      <span>Ao Vivo</span>
    </button>
    <button class="nav-item" data-tab="projects">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <span>Projetos & Arquivos</span>
    </button>
    <button class="nav-item" data-tab="conn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      <span>Conexão</span>
    </button>
  </nav>

  <!-- Client Script -->
  <script>
  (() => {
    // State
    let session = localStorage.getItem('mdc_mobile_session') || '';
    let currentTab = 'live';
    let currentFilter = 'all';
    let projectsData = [];
    let jobsData = [];
    let activeProject = null;
    let eventSource = null;
    let terminalLines = [];
    let selectedCreateKind = 'image';
    let activeStepIndex = 0;
    let promptRecipes = [];
    // Elements
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveText');
    const authView = document.getElementById('authView');
    const liveView = document.getElementById('liveView');
    const projectsView = document.getElementById('projectsView');
    const projectDetailView = document.getElementById('projectDetailView');
    const connView = document.getElementById('connView');
    const bottomNav = document.getElementById('bottomNav');
    const topCreateBtn = document.getElementById('topCreateBtn');
    const openCreateBtn = document.getElementById('openCreateBtn');
    const createProjectModal = document.getElementById('createProjectModal');
    const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
    const createProjectForm = document.getElementById('createProjectForm');
    const authForm = document.getElementById('authForm');
    const authError = document.getElementById('authError');
    const pinBoxes = document.querySelectorAll('.pin-box');
    const runningJobsList = document.getElementById('runningJobsList');
    const recentJobsList = document.getElementById('recentJobsList');
    const refreshJobsBtn = document.getElementById('refreshJobsBtn');
    const terminalStream = document.getElementById('terminalStream');
    const autoScrollCheck = document.getElementById('autoScrollCheck');
    const activeJobsCount = document.getElementById('activeJobsCount');
    const interactionContainer = document.getElementById('interactionContainer');
    const projectsList = document.getElementById('projectsList');
    const lightboxModal = document.getElementById('lightboxModal');
    const lightboxContent = document.getElementById('lightboxContent');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
    const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

    // PIN inputs navigation
    pinBoxes.forEach((box, i) => {
      box.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        e.target.value = val;
        if (val && i < pinBoxes.length - 1) {
          pinBoxes[i + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          pinBoxes[i - 1].focus();
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (text) {
          for (let j = 0; j < pinBoxes.length; j++) {
            pinBoxes[j].value = text[j] || '';
          }
          if (text.length >= 6) {
            submitAuth();
          }
        }
      });
    });

    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitAuth();
    });

    async function submitAuth() {
      let pin = '';
      pinBoxes.forEach(b => pin += b.value);
      if (pin.length !== 6) {
        showAuthError('Digite os 6 caracteres do código.');
        return;
      }
      authError.style.display = 'none';
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pin }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showAuthError(data.error || 'Código incorreto.');
          return;
        }
        session = data.sessionToken;
        localStorage.setItem('mdc_mobile_session', session);
        enterApp();
      } catch (err) {
        showAuthError('Erro ao validar token. Verifique a conexão.');
      }
    }

    function showAuthError(msg) {
      authError.textContent = msg;
      authError.style.display = 'block';
    }

    // Check existing session
    async function checkSession() {
      if (!session) {
        showAuthView();
        return;
      }
      try {
        const res = await fetch('/api/status', {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        const data = await res.json();
        if (res.ok && data.authenticated) {
          enterApp();
        } else {
          showAuthView();
        }
      } catch {
        showAuthView();
      }
    }

    function showAuthView() {
      authView.style.display = 'flex';
      liveView.style.display = 'none';
      projectsView.style.display = 'none';
      projectDetailView.style.display = 'none';
      connView.style.display = 'none';
      bottomNav.style.display = 'none';
      topCreateBtn.style.display = 'none';
      liveDot.className = 'live-dot';
      liveText.textContent = 'Não pareado';
    }

    function enterApp() {
      authView.style.display = 'none';
      bottomNav.style.display = 'flex';
      topCreateBtn.style.display = 'flex';
      switchTab('live');
      connectSse();
      loadJobs();
      loadProjects();
      loadSystemInfo();
      loadPromptRecipes();
    }

    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      liveView.style.display = tab === 'live' ? 'block' : 'none';
      projectsView.style.display = tab === 'projects' ? 'block' : 'none';
      projectDetailView.style.display = 'none';
      connView.style.display = tab === 'conn' ? 'block' : 'none';

      if (tab === 'live') loadJobs();
      if (tab === 'projects') loadProjects();
      if (tab === 'conn') loadSystemInfo();
    }

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderProjects();
      });
    });

    // Refresh jobs manually
    if (refreshJobsBtn) {
      refreshJobsBtn.addEventListener('click', () => {
        loadJobs();
      });
    }

    // SSE Connection
    function connectSse() {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/events?token=' + encodeURIComponent(session));

      eventSource.onopen = () => {
        liveDot.className = 'live-dot connected';
        liveText.textContent = 'Ao Vivo (Túnel)';
      };

      eventSource.onerror = () => {
        liveDot.className = 'live-dot warn';
        liveText.textContent = 'Reconectando...';
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleAppEvent(event);
        } catch {}
      };
    }

    function handleAppEvent(ev) {
      if (ev.type === 'snapshot') {
        jobsData = ev.jobs || [];
        projectsData = ev.projects || [];
        renderJobs();
        renderProjects();
      } else if (ev.type === 'job' && ev.job) {
        const idx = jobsData.findIndex(j => j.id === ev.job.id);
        if (idx >= 0) jobsData[idx] = ev.job;
        else jobsData.unshift(ev.job);
        renderJobs();
        if (activeProject && ev.job.projectId === activeProject.id && projectDetailView.style.display !== 'none') {
          const currentStepId = activeProject.journey?.steps?.[activeStepIndex]?.id;
          window.openProjectDetail(activeProject.id, currentStepId, true);
        }
      } else if (ev.type === 'output') {
        appendTerminalText(ev.data || '');
      } else if (ev.type === 'activity') {
        const job = jobsData.find(j => j.id === ev.jobId);
        if (job) {
          job.currentActivity = ev.activity?.text;
          renderJobs();
        }
      } else if (ev.type === 'refresh') {
        loadProjects();
        loadJobs();
        if (activeProject && projectDetailView.style.display !== 'none') {
          const currentStepId = activeProject.journey?.steps?.[activeStepIndex]?.id;
          window.openProjectDetail(activeProject.id, currentStepId, true);
        }
      }
    }

    function appendTerminalText(text) {
      const clean = text.replace(/\\x1B\\[[0-9;]*[a-zA-Z]/g, '');
      terminalLines.push(clean);
      if (terminalLines.length > 500) terminalLines.shift();
      terminalStream.textContent = terminalLines.join('');
      if (autoScrollCheck.checked) {
        terminalStream.scrollTop = terminalStream.scrollHeight;
      }
    }

    async function loadJobs() {
      try {
        const res = await fetch('/api/jobs', {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        if (res.ok) {
          jobsData = await res.json();
          renderJobs();
        }
      } catch {}
    }

    function renderJobs() {
      const running = jobsData.filter(j => j.status === 'running');
      const recent = jobsData.filter(j => j.status !== 'running').slice(0, 15);

      activeJobsCount.textContent = running.length + ' ativa(s)';

      // Check interactions
      const needsHelp = running.find(j => j.interactionRequest);
      if (needsHelp && needsHelp.interactionRequest) {
        const req = needsHelp.interactionRequest;
        interactionContainer.innerHTML = \`
          <div class="interaction-box">
            <div class="interaction-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Atenção: Ação necessária do agente</span>
            </div>
            <p style="font-size: 13px; color: var(--fg);">\${req.prompt}</p>
            \${req.userCode ? \`<div class="interaction-code">\${req.userCode}</div>\` : ''}
            <div class="interaction-actions">
              \${req.verificationUrl ? \`<a href="\${req.verificationUrl}" target="_blank" class="btn-sm btn-accent" style="text-decoration:none;">Abrir Página Segura</a>\` : ''}
              <button class="btn-sm btn-secondary" onclick="window.dismissInteraction('\${needsHelp.id}')">Já autorizei no desktop</button>
            </div>
          </div>
        \`;
      } else {
        interactionContainer.innerHTML = '';
      }

      // Running jobs
      if (running.length === 0) {
        runningJobsList.innerHTML = \`
          <div class="card" style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
            Nenhuma tarefa em execução no momento.
          </div>
        \`;
      } else {
        runningJobsList.innerHTML = running.map(job => \`
          <div class="card job-card running">
            <div class="job-header">
              <span class="job-title">\${job.title}</span>
              <span class="status-badge running">Executando</span>
            </div>
            \${job.currentActivity ? \`<div class="job-activity"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg> \${job.currentActivity}</div>\` : ''}
            <div class="job-meta">Iniciado em \${new Date(job.createdAt).toLocaleTimeString()}</div>
          </div>
        \`).join('');
      }

      // Recent jobs
      if (recent.length === 0) {
        recentJobsList.innerHTML = \`
          <div class="card" style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
            Nenhuma tarefa finalizada no histórico recente.
          </div>
        \`;
      } else {
        recentJobsList.innerHTML = recent.map(job => \`
          <div class="card job-card \${job.status}" onclick="window.viewJobLogs('\${job.id}')" style="cursor: pointer;">
            <div class="job-header">
              <span class="job-title">\${job.title}</span>
              <span class="status-badge \${job.status}">\${job.status === 'succeeded' ? 'Concluído' : job.status === 'failed' ? 'Falhou' : 'Cancelado'}</span>
            </div>
            <div class="job-meta">
              <span>\${new Date(job.createdAt).toLocaleString()}</span>
              \${job.endedAt ? \` · \${Math.round((new Date(job.endedAt).getTime() - new Date(job.createdAt).getTime()) / 1000)}s\` : ''}
            </div>
          </div>
        \`).join('');
      }
    }

    window.viewJobLogs = async (jobId) => {
      try {
        const res = await fetch('/api/jobs/' + jobId, {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        if (!res.ok) return;
        const job = await res.json();
        if (job && job.log) {
          terminalLines = [job.log];
          terminalStream.textContent = job.log;
          terminalStream.scrollTop = 0;
          window.scrollTo({ top: terminalStream.offsetTop - 80, behavior: 'smooth' });
        }
      } catch {}
    };

    window.dismissInteraction = async (jobId) => {
      try {
        await fetch('/api/jobs/' + jobId + '/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ data: 'done' }),
        });
      } catch {}
    };

    // Load Projects
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects', {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        if (res.ok) {
          projectsData = await res.json();
          renderProjects();
        }
      } catch {}
    }

    function renderProjects() {
      const filtered = projectsData.filter(p => {
        if (currentFilter === 'all') return true;
        return p.kind === currentFilter;
      });

      if (filtered.length === 0) {
        projectsList.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <p>Nenhum projeto encontrado nesta categoria.</p>
            <button class="btn-primary" style="margin-top: 14px; width: auto;" onclick="window.openCreateModal()">Criar Primeiro Conteúdo</button>
          </div>
        \`;
        return;
      }

      projectsList.innerHTML = filtered.map(p => \`
        <div class="project-card" onclick="window.openProjectDetail('\${p.id}')">
          <div class="project-thumb">
            \${p.coverUrl ? \`<img src="\${p.coverUrl}" alt="" loading="lazy">\` : \`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            \`}
          </div>
          <div class="project-info">
            <div class="project-title">\${p.title}</div>
            <div class="project-badges">
              <span class="tag kind-\${p.kind}">\${p.kind === 'image' ? 'Carrossel' : 'Vídeo'}</span>
              \${p.format ? \`<span class="tag">\${p.format}</span>\` : ''}
              <span class="tag">\${p.assetCount || 0} arquivos</span>
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      \`).join('');
    }

    // Prompt Recipes Dropdown
    async function loadPromptRecipes() {
      try {
        const res = await fetch('/api/prompt-recipes', {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        if (res.ok) {
          promptRecipes = await res.json();
          updateRecipeDropdown();
        }
      } catch {}
    }

    function updateRecipeDropdown() {
      const select = document.getElementById('createRecipe');
      if (!select) return;
      const filtered = promptRecipes.filter(r => r.kind === selectedCreateKind);
      select.innerHTML = '<option value="custom">✏️ Personalizado (Livre)</option>' +
        filtered.map(r => \`<option value="\${r.id}">\${r.title} (\${r.category})</option>\`).join('');
    }

    const recipeSelect = document.getElementById('createRecipe');
    if (recipeSelect) {
      recipeSelect.addEventListener('change', () => {
        const recId = recipeSelect.value;
        if (recId === 'custom') return;
        const found = promptRecipes.find(r => r.id === recId);
        if (found) {
          const topicInput = document.getElementById('createTopic');
          if (!topicInput.value.trim()) {
            topicInput.value = found.description || '';
            const titleInput = document.getElementById('createTitle');
            if (!titleInput.dataset.manual) {
              const prefix = selectedCreateKind === 'image' ? 'Carrossel: ' : 'Vídeo: ';
              titleInput.value = prefix + found.title;
            }
          }
        }
      });
    }

    // Project Detail & Journey View
    window.openProjectDetail = async (id, targetStepId, silent) => {
      try {
        const res = await fetch('/api/projects/' + id, {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        if (!res.ok) return;
        const project = await res.json();
        activeProject = project;

        const steps = project.journey?.steps || [];
        if (targetStepId) {
          const idx = steps.findIndex(s => s.id === targetStepId);
          if (idx >= 0) activeStepIndex = idx;
        } else if (!silent) {
          if (project.journey?.nextStep) {
            const idx = steps.findIndex(s => s.id === project.journey.nextStep.id);
            if (idx >= 0) activeStepIndex = idx;
          } else {
            activeStepIndex = 0;
          }
        } else if (activeStepIndex >= steps.length) {
          activeStepIndex = 0;
        }

        renderProjectJourneyView();

        if (!silent) {
          projectsView.style.display = 'none';
          projectDetailView.style.display = 'flex';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {}
    };

    function renderProjectJourneyView() {
      if (!activeProject) return;

      document.getElementById('detailTitle').textContent = activeProject.title;
      document.getElementById('detailBadges').innerHTML = \`
        <span class="tag kind-\${activeProject.kind}">\${activeProject.kind === 'image' ? 'Carrossel (PostNow)' : 'Vídeo (VideoGo)'}</span>
        \${activeProject.format ? \`<span class="tag">\${activeProject.format}</span>\` : ''}
        <span class="tag">\${(activeProject.assets || []).length} arquivos</span>
        <span class="tag">\${new Date(activeProject.createdAt).toLocaleDateString()}</span>
      \`;

      // Render Step Bar
      const stepBar = document.getElementById('detailStepBar');
      const steps = activeProject.journey?.steps || [];
      stepBar.innerHTML = steps.map((step, idx) => {
        const isCurrent = idx === activeStepIndex;
        const statusClass = step.status;
        const icon = step.status === 'done' ? '✓' : step.status === 'running' ? '⚡' : step.status === 'blocked' ? '🔒' : (idx + 1);

        return \`
          <div class="step-pill \${statusClass} \${isCurrent ? 'selected-view' : ''}" onclick="window.selectStep(\${idx})">
            <span>\${icon}</span>
            <span>\${step.title}</span>
          </div>
        \`;
      }).join('');

      renderActiveStep();
      renderProjectAssetsGallery();
    }

    function renderActiveStep() {
      if (!activeProject) return;
      const steps = activeProject.journey?.steps || [];
      const currentStep = steps[activeStepIndex] || steps[0];
      if (!currentStep) return;

      const shell = document.getElementById('detailStepShell');
      const totalSteps = steps.length;
      const isRunning = activeProject.isRunning;

      let contentHtml = '';

      // Running Banner
      const runningBanner = isRunning ? \`
        <div class="step-alert warning" style="animation: pulseBorder 1.5s infinite alternate;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <div>
            <strong>Agente de IA em execução</strong>
            <p style="font-size: 12px; margin-top: 2px;">O modelo está processando esta etapa agora. <a href="javascript:switchTab('live')" style="color: var(--accent); font-weight: 600;">Ver no terminal</a></p>
          </div>
        </div>
      \` : '';

      // Render according to step.id
      if (currentStep.id === 'brief') {
        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Definir a Pauta</div>
          <div class="step-shell-title">Pauta e Briefing Editorial</div>
          <p class="step-shell-desc">Revise o assunto, público-alvo e objetivo do conteúdo antes de preparar os textos.</p>
          \${runningBanner}

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div class="form-group">
              <label class="input-label">Tema / Pauta Principal</label>
              <textarea id="editBriefTopic" class="form-control" rows="3">\${activeProject.brief || ''}</textarea>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-sm btn-secondary" style="flex: 1;" onclick="window.saveBrief()">💾 Salvar Pauta</button>
              <button class="btn-sm btn-accent" style="flex: 1;" onclick="window.prepareStepContent()">
                ⚡ Preparar \${activeProject.kind === 'image' ? 'Textos (Codex)' : 'Roteiro (Claude)'}
              </button>
            </div>
          </div>
        \`;
      } else if (currentStep.id === 'texts') {
        const review = activeProject.visualReview;
        const isApproved = Boolean(review?.approved);
        const pages = review?.pages || [];
        const blocking = review?.blocking || [];

        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Textos</div>
          <div class="step-shell-title">Revisão Editorial das Páginas</div>
          <p class="step-shell-desc">Edite headline, copy e quem aparece em cada slide. É obrigatório aprovar os textos antes de gerar as imagens.</p>
          \${runningBanner}

          \${isApproved ? \`
            <div class="step-alert success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <div><strong>Textos aprovados!</strong> A etapa de imagens está liberada para produção.</div>
            </div>
          \` : \`
            <div class="step-alert warning">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div><strong>Aprovação pendente.</strong> Revise os textos e clique em <em>Aprovar Textos para Produção</em>.</div>
            </div>
          \`}

          \${blocking.length ? \`
            <div class="step-alert error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <div>
                <strong>Ajustes necessários:</strong>
                <ul style="margin-left: 16px; margin-top: 4px; font-size: 12px;">
                  \${blocking.map(b => \`<li>\${b}</li>\`).join('')}
                </ul>
              </div>
            </div>
          \` : ''}

          \${pages.length === 0 ? \`
            <div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">
              Nenhum texto preparado ainda.
              <button class="btn-sm btn-accent" style="margin-top: 10px; width: auto;" onclick="window.prepareStepContent()">⚡ Preparar Textos com IA</button>
            </div>
          \` : \`
            <div class="page-cards-list">
              \${pages.map(p => \`
                <div class="page-card" data-page="\${p.page}">
                  <div class="page-card-header">
                    <span>Página \${p.page} \${p.page === 1 ? '(Capa)' : p.page === pages.length ? '(Fechamento)' : '(Conteúdo)'}</span>
                    <span class="page-card-badge">\${p.page === 1 ? 'Primeiro Impacto' : p.page === pages.length ? 'Chamada' : 'Desenvolvimento'}</span>
                  </div>
                  <div>
                    <label class="input-label">Headline (2 a 6 palavras)</label>
                    <input type="text" class="input-headline" value="\${(p.headline || '').replace(/"/g, '&quot;')}" data-field="headline">
                  </div>
                  <div>
                    <label class="input-label">Copy / Texto Principal</label>
                    <textarea class="input-copy" data-field="copy">\${p.copy || ''}</textarea>
                  </div>
                  <div>
                    <label class="input-label">Quem aparece na arte</label>
                    <select class="select-person" data-field="person">
                      <option value="none" \${p.depictedPerson === 'none' ? 'selected' : ''}>Ninguém (Apenas tipografia e elementos)</option>
                      <option value="other_person" \${p.depictedPerson === 'other_person' ? 'selected' : ''}>Outra pessoa (Banco / Modelo)</option>
                      <option value="client_portrait" \${p.depictedPerson === 'client_portrait' ? 'selected' : ''}>Cliente (Retrato oficial aprovado)</option>
                    </select>
                  </div>
                </div>
              \`).join('')}
            </div>

            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="btn-sm btn-secondary" style="flex: 1;" onclick="window.saveVisualTexts()">💾 Salvar Alterações</button>
              <button class="btn-sm btn-accent" style="flex: 1.5;" onclick="window.approveVisualTexts()">✅ Aprovar Textos para Produção</button>
            </div>
          \`}
        \`;
      } else if (currentStep.id === 'script') {
        const scenes = activeProject.scenes || [];
        const isApproved = activeProject.storyboardReady;

        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Roteiro do Vídeo</div>
          <div class="step-shell-title">Cenas e Direção do Storyboard</div>
          <p class="step-shell-desc">Revise a estrutura de cenas e falas antes de renderizar o vídeo no VideoGo.</p>
          \${runningBanner}

          \${isApproved ? \`
            <div class="step-alert success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <div><strong>Roteiro aprovado!</strong> A etapa de renderização está liberada.</div>
            </div>
          \` : \`
            <div class="step-alert info">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>Revise as cenas abaixo e clique em <em>Aprovar Roteiro</em> para avançar.</div>
            </div>
          \`}

          \${scenes.length === 0 ? \`
            <div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">
              Roteiro ainda não foi gerado.
              <button class="btn-sm btn-accent" style="margin-top: 10px; width: auto;" onclick="window.prepareStepContent()">⚡ Preparar Roteiro com IA</button>
            </div>
          \` : \`
            <div class="page-cards-list">
              \${scenes.map((s, idx) => \`
                <div class="scene-card">
                  <div class="scene-header">
                    <span>Cena \${idx + 1}: \${s.title || s.purpose || 'Cena'}</span>
                    <span class="page-card-badge">\${s.targetSeconds || 5}s</span>
                  </div>
                  <div class="scene-meta">
                    <strong>Direção visual:</strong> \${s.visual?.direction || '-'}
                  </div>
                  <div class="scene-meta">
                    <strong>Narração:</strong> \${s.narration || s.spokenText || '-'}
                  </div>
                  \${s.onScreen?.length ? \`
                    <div class="scene-meta">
                      <strong>Texto na tela:</strong> \${s.onScreen.join(' · ')}
                    </div>
                  \` : ''}
                </div>
              \`).join('')}
            </div>

            <div style="margin-top: 10px;">
              <button class="btn-sm btn-accent" style="width: 100%;" onclick="window.approveStoryboardScript()">✅ Aprovar Roteiro para Produção</button>
            </div>
          \`}
        \`;
      } else if (currentStep.id === 'images') {
        const review = activeProject.visualReview;
        const textsApproved = Boolean(review?.approved);
        const latestBatch = activeProject.batches?.[0];
        const batchAssets = latestBatch?.assets || [];

        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Gerar Imagens</div>
          <div class="step-shell-title">Geração Visual com Codex ImageGen</div>
          <p class="step-shell-desc">Produção dos originais de cada slide pela ferramenta nativa do Codex e conformação de identidade pelo PostNow.</p>
          \${runningBanner}

          \${!textsApproved ? \`
            <div class="step-alert warning">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <strong>Aprovação necessária:</strong> Os textos precisam ser revisados e aprovados antes de disparar a geração de artes.
              </div>
            </div>
            <button class="btn-sm btn-secondary" style="width: 100%; margin-top: 6px;" onclick="window.selectStep(1)">
              Ir para Etapa 2: Textos
            </button>
          \` : \`
            \${batchAssets.length > 0 ? \`
              <div class="step-alert success">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <div><strong>Rodada de imagens pronta!</strong> \${batchAssets.length} artes geradas disponíveis para revisão.</div>
              </div>
            \` : ''}

            \${!isRunning ? \`
              <button class="btn-primary" style="margin-top: 6px;" onclick="window.generateImages()">
                🚀 \${batchAssets.length > 0 ? 'Regerar Rodada Inteira com Codex' : \`Gerar \${review?.pages?.length || 5} Imagens com Codex\`}
              </button>
            \` : ''}

            \${batchAssets.length > 0 ? \`
              <div style="margin-top: 14px;">
                <div style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Prévia das Artes Geradas</div>
                <div class="review-grid">
                  \${batchAssets.map((a, i) => \`
                    <div class="review-item-card">
                      <img src="\${a.url}" class="review-item-img" onclick="window.openLightbox(\${activeProject.assets.findIndex(x => x.name === a.name)})">
                      <div class="review-item-meta">
                        <span style="font-size: 11px; font-weight: 600;">Slide \${i + 1}</span>
                      </div>
                    </div>
                  \`).join('')}
                </div>
                <button class="btn-sm btn-accent" style="width: 100%; margin-top: 10px;" onclick="window.selectStep(3)">
                  Avançar para Revisão Imagem a Imagem →
                </button>
              </div>
            \` : ''}
          \`}
        \`;
      } else if (currentStep.id === 'voice') {
        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Narração e Voz</div>
          <div class="step-shell-title">Locução e Síntese de Voz</div>
          <p class="step-shell-desc">Voz oficial para narração do vídeo pelo VideoGo.</p>
          \${runningBanner}

          <div class="step-alert info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
             <div>Roteiro configurado. Você pode avançar para a renderização do vídeo com sonoplastia e trilha.</div>
          </div>

          <button class="btn-primary" style="margin-top: 10px;" onclick="window.selectStep(activeStepIndex + 1)">
            Avançar para Renderização →
          </button>
        \`;
      } else if (currentStep.id === 'render') {
        const videoAssets = (activeProject.assets || []).filter(a => a.kind === 'video');

        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Renderizar Vídeo</div>
          <div class="step-shell-title">Renderização com VideoGo</div>
          <p class="step-shell-desc">Composição procedural de tipografia, motion, imagens da marca e sonoplastia.</p>
          \${runningBanner}

          \${videoAssets.length > 0 ? \`
            <div class="step-alert success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <div><strong>Vídeo renderizado com sucesso!</strong> Confira a reprodução abaixo.</div>
            </div>
            <div style="margin-top: 12px; border-radius: 8px; overflow: hidden; background: #000;">
              <video src="\${videoAssets[0].url}" controls playsinline style="width: 100%; max-height: 400px; display: block;"></video>
            </div>
          \` : ''}

          \${!isRunning ? \`
            <button class="btn-primary" style="margin-top: 10px;" onclick="window.renderVideo()">
              🎬 \${videoAssets.length > 0 ? 'Renderizar Nova Versão do Vídeo' : 'Renderizar Vídeo no VideoGo'}
            </button>
          \` : ''}
        \`;
      } else if (currentStep.id === 'review') {
        if (activeProject.kind === 'image') {
          const latestBatch = activeProject.batches?.[0];
          const batchAssets = latestBatch?.assets || [];
          const hasRedo = batchAssets.some(a => a.redo);
          const allApproved = batchAssets.length > 0 && batchAssets.every(a => a.approved);

          contentHtml = \`
            <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Revisão</div>
            <div class="step-shell-title">Revisar Imagem a Imagem</div>
            <p class="step-shell-desc">Marque cada imagem como <em>Manter</em> ou <em>Refazer</em>. Refazer permite que o Codex corrija apenas os slides marcados.</p>
            \${runningBanner}

            \${allApproved ? \`
              <div class="step-alert success">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <div><strong>Todas as imagens foram aprovadas!</strong> O pacote está pronto para entrega.</div>
              </div>
            \` : hasRedo ? \`
              <div class="step-alert warning">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>Há imagens marcadas para refazer. Clique abaixo para regerar apenas essas imagens.</div>
              </div>
              <button class="btn-primary" style="margin-top: 6px;" onclick="window.reviseImages()">
                ↺ Regerar Imagens Marcadas com Codex
              </button>
            \` : ''}

            \${batchAssets.length === 0 ? \`
              <div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">
                Nenhuma imagem gerada para revisar.
                <button class="btn-sm btn-accent" style="margin-top: 10px; width: auto;" onclick="window.selectStep(2)">Ir para Etapa 3: Gerar Imagens</button>
              </div>
            \` : \`
              <div class="review-grid" style="margin-top: 10px;">
                \${batchAssets.map((a, i) => \`
                  <div class="review-item-card">
                    <img src="\${a.url}" class="review-item-img" onclick="window.openLightbox(\${activeProject.assets.findIndex(x => x.name === a.name)})">
                    <div class="review-item-meta">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px; font-weight: 700;">Slide \${i + 1}</span>
                        \${a.approved ? '<span class="review-item-status kept">✓ Mantida</span>' : a.redo ? '<span class="review-item-status redo">↺ Refazer</span>' : '<span style="font-size: 11px; color: var(--muted);">Pendente</span>'}
                      </div>
                      \${a.redoNote ? \`<div style="font-size: 11px; color: var(--warning); line-height: 1.2;">Nota: \${a.redoNote}</div>\` : ''}
                      <div class="review-action-btn-group">
                        <button class="btn-review-keep \${a.approved ? 'active' : ''}" onclick="window.keepAsset('\${a.path}')">Manter</button>
                        <button class="btn-review-redo \${a.redo ? 'active' : ''}" onclick="window.redoAsset('\${a.path}')">Refazer</button>
                      </div>
                    </div>
                  </div>
                \`).join('')}
              </div>
            \`}
          \`;
        } else {
          const videoAssets = (activeProject.assets || []).filter(a => a.kind === 'video');
          const isApproved = videoAssets.some(a => a.approved);

          contentHtml = \`
            <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Revisão do Vídeo</div>
            <div class="step-shell-title">Aprovar Vídeo Final</div>
            <p class="step-shell-desc">Assista ao vídeo e confirme a aprovação antes da entrega.</p>
            \${runningBanner}

            \${videoAssets.length === 0 ? \`
              <div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">
                Nenhum vídeo renderizado para revisar.
              </div>
            \` : \`
              <div style="border-radius: 8px; overflow: hidden; background: #000; margin-top: 10px;">
                <video src="\${videoAssets[0].url}" controls playsinline style="width: 100%; max-height: 400px; display: block;"></video>
              </div>
              <button class="btn-primary" style="margin-top: 10px;" onclick="window.keepAsset('\${videoAssets[0].path}')">
                \${isApproved ? '✓ Vídeo Aprovado!' : '✅ Aprovar Vídeo para Entrega'}
              </button>
            \`}
          \`;
        }
      } else if (currentStep.id === 'export') {
        const approvedAssets = (activeProject.assets || []).filter(a => a.approved);

        contentHtml = \`
          <div class="step-eyebrow">Etapa \${activeStepIndex + 1} de \${totalSteps} · Entregar</div>
          <div class="step-shell-title">Conteúdo Pronto para Publicação</div>
          <p class="step-shell-desc">Todos os arquivos aprovados estão listados abaixo com links diretos para download no seu celular.</p>

          \${approvedAssets.length === 0 ? \`
            <div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">
              Nenhum arquivo aprovado ainda para entrega. Conclua as etapas anteriores.
            </div>
          \` : \`
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
              \${approvedAssets.map(a => \`
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;">
                  <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                    \${a.kind === 'image' ? \`<img src="\${a.url}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;">\` : \`<video src="\${a.url}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;"></video>\`}
                    <span style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\${a.name}</span>
                  </div>
                  <a href="\${a.url}&download=1" download="\${a.name}" class="btn-sm btn-accent" style="text-decoration: none; padding: 6px 12px; white-space: nowrap;">Baixar</a>
                </div>
              \`).join('')}
            </div>
          \`}
        \`;
      }

      // Step Navigation Footer
      const canGoNext = currentStep.status === 'done' || activeStepIndex === totalSteps - 1;
      let nextHint = '';
      if (!canGoNext) {
        if (currentStep.id === 'brief') nextHint = 'Salve a pauta ou prepare os textos para avançar.';
        else if (currentStep.id === 'texts') nextHint = 'Aprove os textos acima para avançar para a geração de imagens.';
        else if (currentStep.id === 'images') nextHint = 'Gere as imagens para poder revisá-las.';
        else if (currentStep.id === 'script') nextHint = 'Aprove o roteiro para poder renderizar o vídeo.';
        else if (currentStep.id === 'render') nextHint = 'Renderize o vídeo para poder revisá-lo.';
        else if (currentStep.id === 'review') nextHint = 'Aprove todos os itens para liberar a entrega.';
      }

      const footerHtml = \`
        <div class="step-nav-footer">
          <button class="btn-step-prev" \${activeStepIndex === 0 ? 'disabled style="opacity: 0.35;"' : ''} onclick="window.prevStep()">
            ← Voltar
          </button>
          <button class="btn-step-next" \${canGoNext ? '' : 'disabled'} onclick="window.nextStep()">
            \${activeStepIndex === totalSteps - 1 ? 'Concluído' : 'Próximo →'}
          </button>
        </div>
        \${nextHint ? \`<div class="step-hint-text">\${nextHint}</div>\` : ''}
      \`;

      shell.innerHTML = contentHtml + footerHtml;
    }

    window.selectStep = (idx) => {
      const steps = activeProject?.journey?.steps || [];
      if (idx >= 0 && idx < steps.length) {
        activeStepIndex = idx;
        renderProjectJourneyView();
      }
    };

    window.prevStep = () => {
      if (activeStepIndex > 0) {
        activeStepIndex--;
        renderProjectJourneyView();
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    };

    window.nextStep = () => {
      const steps = activeProject?.journey?.steps || [];
      if (activeStepIndex < steps.length - 1) {
        activeStepIndex++;
        renderProjectJourneyView();
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    };

    function renderProjectAssetsGallery() {
      if (!activeProject) return;
      const assets = activeProject.assets || [];
      document.getElementById('detailAssetCount').textContent = assets.length + ' arquivo(s)';
      const grid = document.getElementById('detailAssetsGrid');
      if (assets.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted); font-size:13px; grid-column: 1 / -1; text-align:center; padding:20px;">Nenhum arquivo gerado ainda para este projeto.</p>';
        return;
      }
      grid.innerHTML = assets.map((a, idx) => {
        const isImg = a.kind === 'image';
        const isVid = a.kind === 'video';
        const isAud = a.kind === 'audio';
        return \`
          <div class="asset-item">
            <div class="asset-media-preview" onclick="window.openLightbox(\${idx})">
              \${isImg ? \`<img src="\${a.url}" alt="\${a.name}" loading="lazy">\` : ''}
              \${isVid ? \`<video src="\${a.url}" preload="metadata" muted playsinline></video>\` : ''}
              \${isAud ? \`<div style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></div>\` : ''}
              \${!isImg && !isVid && !isAud ? \`<div style="display:flex;align-items:center;justify-content:center;height:100%;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>\` : ''}
            </div>
            <div class="asset-meta">
              <span class="asset-name" title="\${a.name}">\${a.name}</span>
              <a href="\${a.url}&download=1" download="\${a.name}" class="asset-download" title="Download">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </a>
            </div>
          </div>
        \`;
      }).join('');
    }

    window.saveBrief = async () => {
      if (!activeProject) return;
      const topicEl = document.getElementById('editBriefTopic');
      const brief = topicEl ? topicEl.value.trim() : (activeProject.brief || '');
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'update-brief', brief }),
        });
        const data = await res.json();
        if (res.ok) {
          activeProject.brief = brief;
          await window.openProjectDetail(activeProject.id, 'brief', true);
          alert('Pauta salva com sucesso!');
        } else {
          alert(data.error || 'Erro ao salvar pauta.');
        }
      } catch {
        alert('Erro de conexão ao salvar pauta.');
      }
    };

    window.prepareStepContent = async () => {
      if (!activeProject) return;
      const isImg = activeProject.kind === 'image';
      const prompt = isImg
        ? 'Prepare os textos e a copy das páginas do carrossel com base no briefing salvo.'
        : 'Prepare o roteiro e o storyboard deste vídeo com base no briefing salvo.';
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'start-agent', prompt }),
        });
        const data = await res.json();
        if (res.ok) {
          switchTab('live');
        } else {
          alert(data.error || 'Erro ao disparar IA.');
        }
      } catch {
        alert('Erro de conexão ao iniciar IA.');
      }
    };

    window.saveVisualTexts = async () => {
      if (!activeProject) return;
      const pageCards = document.querySelectorAll('.page-card');
      const pages = [];
      pageCards.forEach(card => {
        const pageNum = Number(card.dataset.page);
        const headline = card.querySelector('[data-field="headline"]').value.trim();
        const copy = card.querySelector('[data-field="copy"]').value.trim();
        const person = card.querySelector('[data-field="person"]').value;
        pages.push({ page: pageNum, headline, copy, depictedPerson: person });
      });

      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'save-visual', pages }),
        });
        const data = await res.json();
        if (res.ok) {
          await window.openProjectDetail(activeProject.id, 'texts', true);
          alert('Textos salvos com sucesso!');
        } else {
          alert(data.error || 'Erro ao salvar textos.');
        }
      } catch {
        alert('Erro de conexão ao salvar textos.');
      }
    };

    window.approveVisualTexts = async () => {
      if (!activeProject || !activeProject.visualReview) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({
            action: 'approve-visual',
            contentHash: activeProject.visualReview.contentHash,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          await window.openProjectDetail(activeProject.id, 'images');
        } else {
          alert(data.error || 'Erro ao aprovar textos.');
        }
      } catch {
        alert('Erro de conexão ao aprovar textos.');
      }
    };

    window.approveStoryboardScript = async () => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'approve-storyboard' }),
        });
        const data = await res.json();
        if (res.ok) {
          const nextStepId = activeProject.kind === 'video' ? 'render' : 'images';
          await window.openProjectDetail(activeProject.id, nextStepId);
        } else {
          alert(data.error || 'Erro ao aprovar roteiro.');
        }
      } catch {
        alert('Erro de conexão ao aprovar roteiro.');
      }
    };

    window.generateImages = async () => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'generate-images' }),
        });
        const data = await res.json();
        if (res.ok) {
          switchTab('live');
        } else {
          alert(data.error || 'Erro ao gerar imagens.');
        }
      } catch {
        alert('Erro ao comunicar com o servidor.');
      }
    };

    window.reviseImages = async () => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'revise-images' }),
        });
        const data = await res.json();
        if (res.ok) {
          switchTab('live');
        } else {
          alert(data.error || 'Erro ao regerar imagens.');
        }
      } catch {
        alert('Erro de conexão ao regerar imagens.');
      }
    };

    window.keepAsset = async (path) => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'approve-asset', path }),
        });
        if (res.ok) {
          await window.openProjectDetail(activeProject.id, 'review', true);
        }
      } catch {}
    };

    window.redoAsset = async (path) => {
      if (!activeProject) return;
      const note = prompt('Observação para a IA refazer esta imagem (opcional):') || '';
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'review-asset', path, redo: true, note }),
        });
        if (res.ok) {
          await window.openProjectDetail(activeProject.id, 'review', true);
        }
      } catch {}
    };

    window.renderVideo = async () => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'render' }),
        });
        const data = await res.json();
        if (res.ok) {
          switchTab('live');
        } else {
          alert(data.error || 'Erro ao renderizar vídeo.');
        }
      } catch {
        alert('Erro de conexão ao renderizar vídeo.');
      }
    };

    window.runProjectAction = async (actionType) => {
      if (!activeProject) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: actionType }),
        });
        const data = await res.json();
        if (res.ok) {
          switchTab('live');
        } else {
          alert(data.error || 'Erro ao executar ação.');
        }
      } catch {
        alert('Erro ao comunicar com o servidor.');
      }
    };

    document.getElementById('sendAgentPromptBtn').addEventListener('click', async () => {
      if (!activeProject) return;
      const input = document.getElementById('agentPromptText');
      const text = input.value.trim();
      if (!text) return;
      try {
        const res = await fetch('/api/projects/' + activeProject.id + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({ action: 'start-agent', prompt: text }),
        });
        if (res.ok) {
          input.value = '';
          switchTab('live');
        } else {
          const data = await res.json();
          alert(data.error || 'Erro ao enviar instrução.');
        }
      } catch {
        alert('Falha na conexão.');
      }
    });

    document.getElementById('backToProjectsBtn').addEventListener('click', () => {
      projectDetailView.style.display = 'none';
      projectsView.style.display = 'block';
    });

    // Create Content Workflow Handlers
    window.openCreateModal = () => {
      createProjectModal.style.display = 'flex';
      updateRecipeDropdown();
      document.getElementById('createTopic').focus();
    };

    if (topCreateBtn) topCreateBtn.addEventListener('click', window.openCreateModal);
    if (openCreateBtn) openCreateBtn.addEventListener('click', window.openCreateModal);

    closeCreateModalBtn.addEventListener('click', () => {
      createProjectModal.style.display = 'none';
    });

    window.selectCreateKind = (kind) => {
      selectedCreateKind = kind;
      const typeImage = document.getElementById('typeImageBtn');
      const typeVideo = document.getElementById('typeVideoBtn');
      const formatSelect = document.getElementById('createFormat');
      const pageCountGroup = document.getElementById('pageCountGroup');

      if (kind === 'image') {
        typeImage.className = 'create-type-btn selected';
        typeVideo.className = 'create-type-btn';
        formatSelect.innerHTML = \`
          <option value="carousel-1x1">Carrossel Quadrado 1:1 (Feed)</option>
          <option value="carousel-4x5">Carrossel Vertical 4:5 (Instagram)</option>
          <option value="post-1x1">Post Quadrado 1:1</option>
          <option value="post-4x5">Post Vertical 4:5</option>
          <option value="story-9x16">Story Estático 9:16</option>
        \`;
        pageCountGroup.style.display = 'block';
      } else {
        typeImage.className = 'create-type-btn';
        typeVideo.className = 'create-type-btn selected';
        formatSelect.innerHTML = \`
          <option value="reels">Reels / Shorts / TikTok (9:16)</option>
          <option value="story">Story Vídeo (9:16)</option>
          <option value="feed-square">Feed Quadrado (1:1)</option>
          <option value="youtube">YouTube Horizontal (16:9)</option>
        \`;
        pageCountGroup.style.display = 'none';
      }
      updateRecipeDropdown();
    };

    // Auto suggest title while typing topic
    document.getElementById('createTopic').addEventListener('input', (e) => {
      const titleInput = document.getElementById('createTitle');
      if (!titleInput.dataset.manual) {
        const val = e.target.value.trim();
        if (val) {
          const prefix = selectedCreateKind === 'image' ? 'Carrossel: ' : 'Vídeo: ';
          titleInput.value = prefix + val.slice(0, 36);
        }
      }
    });

    document.getElementById('createTitle').addEventListener('input', () => {
      document.getElementById('createTitle').dataset.manual = '1';
    });

    createProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const topic = document.getElementById('createTopic').value.trim();
      let title = document.getElementById('createTitle').value.trim();
      if (!title) title = (selectedCreateKind === 'image' ? 'Carrossel: ' : 'Vídeo: ') + topic.slice(0, 30);
      const format = document.getElementById('createFormat').value;
      const pageCount = Number(document.getElementById('createPages').value) || 5;
      const audience = document.getElementById('createAudience').value.trim();
      const tone = document.getElementById('createTone').value.trim();
      const cta = document.getElementById('createCta').value.trim();
      const autoStart = document.getElementById('createAutoStart').checked;

      const fullBrief = [
        \`## Pauta e Objetivo\n\${topic}\`,
        \`- Público: \${audience || 'Geral'}\`,
        \`- Tom de voz: \${tone || 'Direto e claro'}\`,
        \`- Chamada para ação: \${cta || 'Compartilhe'}\`,
        \`- Formato: \${format}\`,
      ].join('\n');

      const submitBtn = document.getElementById('submitCreateBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Criando projeto e disparando IA...';

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
          body: JSON.stringify({
            title,
            topic,
            kind: selectedCreateKind,
            format,
            pageCount,
            brief: fullBrief,
            autoStartAgent: autoStart,
          }),
        });

        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 Criar Projeto e Abrir Estúdio</span>';

        if (res.ok && data.ok && data.project) {
          createProjectModal.style.display = 'none';
          createProjectForm.reset();
          delete document.getElementById('createTitle').dataset.manual;
          loadProjects();
          loadJobs();
          // Open project directly in the journey view!
          window.openProjectDetail(data.project.id);
        } else {
          alert(data.error || 'Erro ao criar projeto.');
        }
      } catch {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 Criar Projeto e Abrir Estúdio</span>';
        alert('Falha na conexão ao criar o projeto.');
      }
    });
    // Lightbox / Media Viewer
    window.openLightbox = (index) => {
      if (!activeProject || !activeProject.assets) return;
      const asset = activeProject.assets[index];
      if (!asset) return;

      lightboxTitle.textContent = asset.name;
      lightboxDownloadBtn.href = asset.url + '&download=1';
      lightboxDownloadBtn.setAttribute('download', asset.name);

      if (asset.kind === 'image') {
        lightboxContent.innerHTML = \`<img src="\${asset.url}" alt="\${asset.name}">\`;
      } else if (asset.kind === 'video') {
        lightboxContent.innerHTML = \`<video src="\${asset.url}" controls autoplay playsinline style="max-width:100%;max-height:80vh;"></video>\`;
      } else if (asset.kind === 'audio') {
        lightboxContent.innerHTML = \`<audio src="\${asset.url}" controls autoplay style="width:100%;max-width:320px;"></audio>\`;
      } else {
        lightboxContent.innerHTML = \`<p style="color:#fff;">Arquivo: \${asset.name}</p>\`;
      }

      lightboxModal.style.display = 'flex';
    };

    lightboxCloseBtn.addEventListener('click', () => {
      lightboxModal.style.display = 'none';
      lightboxContent.innerHTML = '';
    });

    // System Info
    async function loadSystemInfo() {
      try {
        const res = await fetch('/api/status', {
          headers: { 'Authorization': 'Bearer ' + session },
        });
        const data = await res.json();
        document.getElementById('connTunnelStatus').textContent = data.tunnelUrl ? 'Cloudflare Tunnel Ativo' : 'Túnel Inativo';
        document.getElementById('connUrl').textContent = data.tunnelUrl || '-';
        document.getElementById('connToken').textContent = data.token || '-';
        document.getElementById('connWorkspace').textContent = data.workspace || '-';
        document.getElementById('connVersion').textContent = 'v' + (data.version || '0.2.0');

        const qrRes = await fetch('/api/qr.svg');
        if (qrRes.ok) {
          const svgText = await qrRes.text();
          document.getElementById('qrContainer').innerHTML = svgText;
        }
      } catch {}
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + session },
        });
      } catch {}
      localStorage.removeItem('mdc_mobile_session');
      session = '';
      if (eventSource) eventSource.close();
      showAuthView();
    });

    // Start
    checkSession();
  })();
  </script>
</body>
</html>`;
}
