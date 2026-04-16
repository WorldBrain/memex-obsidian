"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  MemexObsidianPlugin: () => MemexObsidianPlugin,
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/config.ts
var DEFAULT_MEMEX_BASE_URL = "https://memex.garden";
function getMemexBaseUrl() {
  const configuredBaseUrl = "https://memex.garden"?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }
  return DEFAULT_MEMEX_BASE_URL;
}

// src/bridge-protocol.ts
var OBSIDIAN_SIDEBAR_BRIDGE_VERSION = 1;
var OBSIDIAN_SIDEBAR_DASHBOARD_PATH = "/dashboard";
var OBSIDIAN_SIDEBAR_DASHBOARD_TRAILING_SLASH_PATH = "/dashboard/";
var OBSIDIAN_SIDEBAR_EMBED_PATH = "/embed/obsidian-sidebar";
var OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM = "host";
var OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE = "obsidian";
var OBSIDIAN_OAUTH_CALLBACK_URL = "obsidian://memex-auth";
function isMemexSidebarIframeMessage(value) {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.type === "string" && typeof candidate.bridgeVersion === "number";
}
function getObsidianSidebarEmbedUrls() {
  const seenUrls = /* @__PURE__ */ new Set();
  const buildEmbedUrl = (path) => {
    const url = new URL(path, getMemexBaseUrl());
    url.searchParams.set(
      OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
      OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE
    );
    return url.toString();
  };
  return [
    OBSIDIAN_SIDEBAR_DASHBOARD_PATH,
    OBSIDIAN_SIDEBAR_DASHBOARD_TRAILING_SLASH_PATH,
    OBSIDIAN_SIDEBAR_EMBED_PATH
  ].flatMap((path) => {
    const url = buildEmbedUrl(path);
    if (seenUrls.has(url)) {
      return [];
    }
    seenUrls.add(url);
    return [url];
  });
}
function getObsidianHostedAuthUrl() {
  const url = new URL("/auth", getMemexBaseUrl());
  url.searchParams.set(
    OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
    OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE
  );
  return url.toString();
}

// src/result-card.ts
var MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE = "memex-card";
var MEMEX_RESULT_CARD_DRAG_MIME_TYPE = "application/x-memex-result-card";
function parseMemexResultCardPayload(source) {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.v !== 1 || parsed.kind !== "memex-result-card" || parsed.entity == null || typeof parsed.entity !== "object" || typeof parsed.entity.id !== "string" || typeof parsed.entity.type !== "string") {
      return null;
    }
    return {
      v: 1,
      kind: "memex-result-card",
      entity: parsed.entity,
      snippets: Array.isArray(parsed.snippets) ? parsed.snippets : void 0,
      tagEntities: Array.isArray(parsed.tagEntities) ? parsed.tagEntities : void 0,
      relatedContentEntities: Array.isArray(
        parsed.relatedContentEntities
      ) ? parsed.relatedContentEntities : void 0
    };
  } catch {
    return null;
  }
}
function formatDroppedMemexResultCardCodeBlock(source) {
  return `${source.trimEnd()}

`;
}
function getEditorPositionAfterInsertedText(start, insertedText) {
  const lines = insertedText.split("\n");
  if (lines.length === 1) {
    return {
      line: start.line,
      ch: start.ch + insertedText.length
    };
  }
  return {
    line: start.line + lines.length - 1,
    ch: lines.at(-1)?.length ?? 0
  };
}
function getEntityTitle(entity) {
  return entity.title || entity.text || entity.author_name || entity.author_handle || entity.description || entity.url || entity.id;
}
function getEntitySnippet(entity, snippets) {
  const snippet = snippets?.find((value) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return value.text.trim().length > 0;
  });
  if (snippet != null) {
    return typeof snippet === "string" ? snippet : snippet.text;
  }
  return entity.text?.trim() || entity.description?.trim() || null;
}
function getEntityUrl(entity) {
  if (entity.url?.trim()) {
    return entity.url;
  }
  if (entity.permalink?.trim()) {
    if (entity.permalink.startsWith("http://") || entity.permalink.startsWith("https://")) {
      return entity.permalink;
    }
    if (entity.type === "reddit") {
      return `https://www.reddit.com${entity.permalink}`;
    }
  }
  return null;
}
function createActionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}
function renderMemexResultCardBlock(params) {
  const payload = parseMemexResultCardPayload(params.source);
  params.containerEl.replaceChildren();
  if (payload == null) {
    const error = document.createElement("div");
    error.className = "memex-obsidian-result-card-error";
    error.textContent = "Invalid Memex result card payload.";
    params.containerEl.appendChild(error);
    return;
  }
  const block = document.createElement("div");
  block.className = "memex-obsidian-result-card-block";
  const card = document.createElement("div");
  card.className = "memex-obsidian-result-card";
  const header = document.createElement("div");
  header.className = "memex-obsidian-result-card-header";
  const title = document.createElement("h4");
  title.className = "memex-obsidian-result-card-title";
  title.textContent = getEntityTitle(payload.entity);
  const meta = document.createElement("div");
  meta.className = "memex-obsidian-result-card-meta";
  meta.textContent = payload.entity.type;
  header.append(title, meta);
  card.appendChild(header);
  const snippet = getEntitySnippet(payload.entity, payload.snippets);
  if (snippet) {
    const body = document.createElement("p");
    body.className = "memex-obsidian-result-card-snippet";
    body.textContent = snippet;
    card.appendChild(body);
  }
  const actions = document.createElement("div");
  actions.className = "memex-obsidian-result-card-actions";
  const entityUrl = getEntityUrl(payload.entity);
  if (entityUrl) {
    actions.appendChild(
      createActionButton("Open source", () => {
        window.open(entityUrl, "_blank", "noopener,noreferrer");
      })
    );
  }
  actions.appendChild(
    createActionButton("Open notes", () => {
      void params.onOpenNotes({
        contentEntityId: payload.entity.id,
        title: getEntityTitle(payload.entity)
      });
    })
  );
  card.appendChild(actions);
  block.appendChild(card);
  params.containerEl.appendChild(block);
}

// src/sidebar-view.ts
var import_obsidian = require("obsidian");

// src/sidebar-bridge-controller.ts
var DEFAULT_READY_TIMEOUT_MS = 15e3;
var ObsidianSidebarBridgeController = class {
  constructor(options) {
    this.options = options;
  }
  iframe = null;
  readyTimeout = null;
  isReady = false;
  attach(iframe) {
    this.iframe = iframe;
    window.addEventListener("message", this.handleMessage);
  }
  detach() {
    window.removeEventListener("message", this.handleMessage);
    this.clearReadyTimeout();
    this.iframe = null;
    this.isReady = false;
  }
  handleIframeLoad() {
    this.isReady = false;
    this.clearReadyTimeout();
    this.readyTimeout = window.setTimeout(() => {
      this.readyTimeout = null;
      if (!this.isReady) {
        this.options.onReadyTimeout();
      }
    }, this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
  }
  ready() {
    return this.isReady;
  }
  postMessage(message) {
    this.iframe?.contentWindow?.postMessage(
      message,
      this.options.iframeOrigin
    );
  }
  clearReadyTimeout() {
    if (this.readyTimeout != null) {
      window.clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
  }
  handleMessage = (event) => {
    if (event.origin !== this.options.iframeOrigin || event.source !== this.iframe?.contentWindow || !isMemexSidebarIframeMessage(event.data)) {
      return;
    }
    const message = event.data;
    if (message.type === "memex:iframe:ready") {
      if (message.bridgeVersion !== this.options.bridgeVersion) {
        this.isReady = false;
        this.clearReadyTimeout();
        this.options.onBridgeVersionMismatch(message);
        return;
      }
      this.isReady = true;
      this.clearReadyTimeout();
      this.options.onReady();
      return;
    }
    switch (message.type) {
      case "memex:iframe:request-auth":
        this.options.onRequestAuth();
        return;
      case "memex:iframe:open-external-url":
        this.options.onOpenExternalUrl(message.url);
        return;
      case "memex:iframe:native-action":
        this.options.onNativeAction?.(message);
        return;
      case "memex:iframe:telemetry":
        this.options.onTelemetry?.(message);
        return;
    }
  };
};

// src/sidebar-view.ts
var FEATURE_FLAGS = {
  localMarkdownRendering: true,
  localEditorDropHandling: true,
  localInlineSearchRendering: false
};
var MEMEX_OBSIDIAN_VIEW_TYPE = "memex-sidebar";
var MemexSidebarView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  iframe = null;
  controller = null;
  pendingMessages = [];
  themeObserver = null;
  embedUrls = [];
  currentEmbedUrlIndex = 0;
  getViewType() {
    return MEMEX_OBSIDIAN_VIEW_TYPE;
  }
  getDisplayText() {
    return "Memex Sidebar";
  }
  async onOpen() {
    this.contentEl.replaceChildren();
    const host = this.contentEl.createDiv({
      cls: "memex-obsidian-sidebar-host"
    });
    this.embedUrls = getObsidianSidebarEmbedUrls();
    this.currentEmbedUrlIndex = 0;
    const embedUrl = this.embedUrls[0];
    const iframeOrigin = new URL(embedUrl).origin;
    const iframe = document.createElement("iframe");
    iframe.className = "memex-obsidian-sidebar-iframe";
    iframe.src = embedUrl;
    iframe.title = "Memex Sidebar";
    host.appendChild(iframe);
    const controller = new ObsidianSidebarBridgeController({
      iframeOrigin,
      bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
      onReady: () => {
        void this.sendInitialHostState();
      },
      onBridgeVersionMismatch: () => {
        new import_obsidian.Notice("Memex sidebar bridge version mismatch.");
      },
      onReadyTimeout: () => {
        if (this.retryAlternateEmbedUrl()) {
          return;
        }
        new import_obsidian.Notice("Memex sidebar did not finish loading in time.");
      },
      onRequestAuth: () => {
        void this.plugin.startLoginFlow();
      },
      onOpenExternalUrl: (url) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return;
          }
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          return;
        }
      },
      onNativeAction: (message) => {
        console.warn(
          "[Memex Obsidian] Unsupported native action:",
          message.action,
          message.payload
        );
      },
      onTelemetry: (message) => {
        console.warn("[Memex Obsidian]", message.name, message.payload);
      }
    });
    iframe.addEventListener("load", () => {
      controller.handleIframeLoad();
    });
    controller.attach(iframe);
    this.iframe = iframe;
    this.controller = controller;
    this.observeThemeChanges();
  }
  async onClose() {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.controller?.detach();
    this.controller = null;
    this.iframe = null;
    this.pendingMessages = [];
    this.embedUrls = [];
    this.currentEmbedUrlIndex = 0;
  }
  openSearchNotes(params) {
    this.postHostMessage({
      type: "memex:host:event",
      bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
      event: {
        type: "openSearchNotes",
        contentEntityId: params.contentEntityId,
        title: params.title
      }
    });
  }
  syncAuthSession(session) {
    this.postHostMessage({
      type: "memex:host:auth-session",
      bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
      session
    });
  }
  async sendInitialHostState() {
    this.postHostMessage({
      type: "memex:host:init",
      bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
      theme: this.getCurrentTheme(),
      baseUrl: getMemexBaseUrl(),
      hostEnvironment: "obsidian",
      featureFlags: FEATURE_FLAGS
    });
    this.postHostMessage({
      type: "memex:host:auth-session",
      bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
      session: this.plugin.getAuthSession()
    });
    this.flushPendingMessages();
  }
  postHostMessage(message) {
    if (this.controller?.ready()) {
      this.controller.postMessage(message);
      return;
    }
    this.pendingMessages.push(message);
  }
  flushPendingMessages() {
    if (!this.controller?.ready()) {
      return;
    }
    for (const message of this.pendingMessages) {
      this.controller.postMessage(message);
    }
    this.pendingMessages = [];
  }
  observeThemeChanges() {
    this.themeObserver?.disconnect();
    this.themeObserver = new MutationObserver(() => {
      this.postHostMessage({
        type: "memex:host:event",
        bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
        event: {
          type: "themeChanged",
          theme: this.getCurrentTheme()
        }
      });
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  retryAlternateEmbedUrl() {
    const nextEmbedUrl = this.embedUrls[this.currentEmbedUrlIndex + 1];
    if (this.iframe == null || this.controller == null || nextEmbedUrl == null) {
      return false;
    }
    this.currentEmbedUrlIndex += 1;
    console.warn(
      "[Memex Obsidian] Retrying hosted dashboard load with alternate URL:",
      nextEmbedUrl
    );
    this.iframe.src = nextEmbedUrl;
    this.controller.handleIframeLoad();
    return true;
  }
  getCurrentTheme() {
    return document.body.classList.contains("theme-light") ? "light" : "dark";
  }
};

// src/main.ts
var OAUTH_PROTOCOL_ACTION = "memex-auth";
var DEFAULT_DATA = {
  authSession: null
};
var ResultCardRenderChild = class extends import_obsidian2.MarkdownRenderChild {
  constructor(containerEl, plugin, source) {
    super(containerEl);
    this.plugin = plugin;
    this.source = source;
  }
  onload() {
    renderMemexResultCardBlock({
      app: this.plugin.app,
      containerEl: this.containerEl,
      plugin: this.plugin,
      source: this.source,
      onOpenNotes: (params) => this.plugin.openSearchNotesInSidebar(params)
    });
  }
  onunload() {
    this.containerEl.replaceChildren();
  }
};
var CallbackUrlModal = class extends import_obsidian2.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  callbackUrl = "";
  onOpen() {
    const { contentEl } = this;
    contentEl.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = "Paste Memex OAuth Callback URL";
    contentEl.appendChild(title);
    new import_obsidian2.Setting(contentEl).setName("Callback URL").setDesc("Paste the full URL you were redirected to after login.").addTextArea((text) => {
      text.setPlaceholder(`${OBSIDIAN_OAUTH_CALLBACK_URL}?hash=...`);
      text.inputEl.rows = 4;
      text.onChange((value) => {
        this.callbackUrl = value.trim();
      });
    });
    new import_obsidian2.Setting(contentEl).addButton((button) => {
      button.setButtonText("Complete Login").setCta().onClick(() => {
        if (!this.callbackUrl) {
          new import_obsidian2.Notice("Please paste a callback URL first.");
          return;
        }
        this.onSubmit(this.callbackUrl);
        this.close();
      });
    });
  }
};
var MemexObsidianSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.replaceChildren();
    new import_obsidian2.Setting(containerEl).setName("Login with Memex").setDesc("Start the hosted Memex login flow in your browser.").addButton((button) => {
      button.setButtonText("Login with Memex").setCta().onClick(() => {
        void this.plugin.startLoginFlow();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Manual callback fallback").setDesc(
      "Use this when callback redirect handling fails on your machine."
    ).addButton((button) => {
      button.setButtonText("Paste Callback URL").onClick(() => this.plugin.openCallbackUrlModal());
    });
  }
};
var MemexObsidianPlugin = class extends import_obsidian2.Plugin {
  dataState = DEFAULT_DATA;
  async onload() {
    await this.loadPluginData();
    this.registerView(
      MEMEX_OBSIDIAN_VIEW_TYPE,
      (leaf) => new MemexSidebarView(leaf, this)
    );
    this.addSettingTab(new MemexObsidianSettingTab(this.app, this));
    this.addCommand({
      id: "toggle-memex-sidebar",
      name: "Toggle Memex Sidebar",
      callback: () => {
        void this.toggleSidebar();
      }
    });
    this.addCommand({
      id: "memex-login-with-browser",
      name: "Login with Memex",
      callback: () => {
        void this.startLoginFlow();
      }
    });
    this.addCommand({
      id: "memex-paste-callback-url",
      name: "Paste Memex Callback URL",
      callback: () => this.openCallbackUrlModal()
    });
    this.registerEvent(
      this.app.workspace.on("editor-drop", (event, editor) => {
        void this.handleEditorDrop(event, editor);
      })
    );
    this.registerObsidianProtocolHandler(
      OAUTH_PROTOCOL_ACTION,
      (params) => {
        void this.handleProtocolCallback(params);
      }
    );
    this.registerMarkdownCodeBlockProcessor(
      MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE,
      (source, el, context) => {
        context.addChild(new ResultCardRenderChild(el, this, source));
      }
    );
  }
  async onunload() {
    this.app.workspace.getLeavesOfType(MEMEX_OBSIDIAN_VIEW_TYPE).forEach((leaf) => leaf.detach());
  }
  getAuthSession() {
    return this.dataState.authSession;
  }
  async toggleSidebar() {
    const existingLeaves = this.app.workspace.getLeavesOfType(
      MEMEX_OBSIDIAN_VIEW_TYPE
    );
    if (existingLeaves.length > 0) {
      existingLeaves.forEach((leaf) => leaf.detach());
      return;
    }
    await this.ensureSidebarOpen();
  }
  async ensureSidebarOpen() {
    const existingLeaves = this.app.workspace.getLeavesOfType(
      MEMEX_OBSIDIAN_VIEW_TYPE
    );
    if (existingLeaves.length > 0) {
      await this.app.workspace.revealLeaf(existingLeaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
    if (!leaf) {
      new import_obsidian2.Notice("Could not open Memex sidebar leaf.");
      return;
    }
    await leaf.setViewState({
      type: MEMEX_OBSIDIAN_VIEW_TYPE,
      active: true
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  async openSearchNotesInSidebar(params) {
    await this.ensureSidebarOpen();
    const sidebarView = this.app.workspace.getLeavesOfType(
      MEMEX_OBSIDIAN_VIEW_TYPE
    )[0]?.view;
    if (!(sidebarView instanceof MemexSidebarView)) {
      return;
    }
    sidebarView.openSearchNotes(params);
  }
  async startLoginFlow() {
    const authUrl = getObsidianHostedAuthUrl();
    window.open(authUrl, "_blank", "noopener,noreferrer");
    new import_obsidian2.Notice("Opened Memex login in your browser.");
  }
  openCallbackUrlModal() {
    const modal = new CallbackUrlModal(this.app, (callbackUrl) => {
      void this.completeOAuthFromCallbackUrl(callbackUrl);
    });
    modal.open();
  }
  async completeOAuthFromCallbackUrl(callbackUrl) {
    try {
      const session = parseAuthSessionPayload(callbackUrl);
      this.dataState = {
        ...this.dataState,
        authSession: session
      };
      await this.persistPluginData();
      this.syncAuthSessionToOpenSidebars();
      new import_obsidian2.Notice("Memex login complete.");
    } catch (error) {
      new import_obsidian2.Notice(
        error instanceof Error ? `OAuth callback failed: ${error.message}` : "OAuth callback failed."
      );
    }
  }
  async loadPluginData() {
    const loaded = await this.loadData();
    this.dataState = {
      ...DEFAULT_DATA,
      ...loaded ?? {}
    };
  }
  async persistPluginData() {
    await this.saveData(this.dataState);
  }
  syncAuthSessionToOpenSidebars() {
    const sidebarLeaves = this.app.workspace.getLeavesOfType(
      MEMEX_OBSIDIAN_VIEW_TYPE
    );
    for (const leaf of sidebarLeaves) {
      const sidebarView = leaf.view;
      if (!(sidebarView instanceof MemexSidebarView)) {
        continue;
      }
      sidebarView.syncAuthSession(this.dataState.authSession);
    }
  }
  async handleProtocolCallback(params) {
    const callbackUrl = this.buildCallbackUrlFromProtocolParams(params);
    if (!callbackUrl) {
      new import_obsidian2.Notice("Missing callback params in obsidian://memex-auth URL.");
      return;
    }
    await this.completeOAuthFromCallbackUrl(callbackUrl);
  }
  buildCallbackUrlFromProtocolParams(params) {
    const query = new URLSearchParams();
    let hashPayload = null;
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = key.trim();
      if (!normalizedKey || normalizedKey === "action") {
        continue;
      }
      if (normalizedKey === "hash") {
        const normalizedHash = this.normalizeOAuthHashPayload(value);
        if (normalizedHash) {
          hashPayload = normalizedHash;
        }
        continue;
      }
      query.set(normalizedKey, value);
    }
    const queryString = query.toString();
    if (!queryString && !hashPayload) {
      return null;
    }
    return `obsidian://${OAUTH_PROTOCOL_ACTION}${queryString ? `?${queryString}` : ""}${hashPayload ? `#${hashPayload}` : ""}`;
  }
  normalizeOAuthHashPayload(rawHash) {
    let normalized = rawHash.trim();
    if (normalized.startsWith("#")) {
      normalized = normalized.slice(1);
    }
    for (let index = 0; index < 2; index += 1) {
      try {
        const decoded = decodeURIComponent(normalized);
        if (decoded === normalized) {
          break;
        }
        normalized = decoded;
      } catch {
        break;
      }
    }
    return normalized;
  }
  async handleEditorDrop(event, editor) {
    if (event.defaultPrevented) {
      return;
    }
    const resultCardCodeBlock = event.dataTransfer?.getData(
      MEMEX_RESULT_CARD_DRAG_MIME_TYPE
    );
    if (resultCardCodeBlock?.trim()) {
      event.preventDefault();
      const insertAt = editor.getCursor();
      const insertedText = formatDroppedMemexResultCardCodeBlock(resultCardCodeBlock);
      editor.replaceRange(insertedText, insertAt);
      editor.setCursor(
        getEditorPositionAfterInsertedText(insertAt, insertedText)
      );
      return;
    }
    const rawData = event.dataTransfer?.getData(
      "application/x-memex-reference"
    );
    if (!rawData) {
      return;
    }
    const parsed = this.parseMemexReferenceDragData(rawData);
    if (parsed == null) {
      return;
    }
    event.preventDefault();
    editor.replaceRange(`[[memex:${parsed.contentId}]]`, editor.getCursor());
  }
  parseMemexReferenceDragData(rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (!parsed.contentId) {
        return null;
      }
      return { contentId: parsed.contentId };
    } catch {
      return null;
    }
  }
};
function parseAuthSessionPayload(callbackUrl) {
  const callback = new URL(callbackUrl);
  const hashParams = new URLSearchParams(callback.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const queryError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
  const hashError = hashParams.get("error_description") ?? hashParams.get("error");
  if (!accessToken || !refreshToken) {
    throw new Error(
      queryError || hashError || `Missing OAuth callback parameters in URL: ${callbackUrl}`
    );
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: extractJwtExpiration(accessToken),
    tokenType: "bearer",
    providerToken: null,
    providerRefreshToken: null
  };
}
function extractJwtExpiration(token) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
  return atob(padded);
}
var main_default = MemexObsidianPlugin;
