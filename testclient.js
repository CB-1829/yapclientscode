/**
 * Yap++ Client Core Architecture, Part 1 Plugins & Test Client UI
 * Author: @salami on Yapper
 */

(function () {
    console.log("[Yap++] Initializing Yap++ Client...");

    // ==========================================
    // 1. Core Architecture (PluginHost)
    // ==========================================
    class PluginHost {
        constructor() {
            this.plugins = new Map();
            this.storageKey = "yap_plus_plus_plugins";
            this.enabledPlugins = new Set(this.loadState());
        }

        loadState() {
            try {
                const saved = localStorage.getItem(this.storageKey);
                return saved ? JSON.parse(saved) : [];
            } catch (e) {
                console.error("[Yap++] Failed to load plugin state:", e);
                return [];
            }
        }

        saveState() {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify([...this.enabledPlugins]));
            } catch (e) {
                console.error("[Yap++] Failed to save plugin state:", e);
            }
        }

        register(plugin) {
            if (!plugin.id || !plugin.name) {
                console.error("[Yap++] Invalid plugin structure:", plugin);
                return;
            }
            this.plugins.set(plugin.id, plugin);
            console.log(`[Yap++] Registered plugin: ${plugin.name} (${plugin.id})`);

            if (this.enabledPlugins.has(plugin.id)) {
                this.startPlugin(plugin);
            }
        }

        enable(pluginId) {
            const plugin = this.plugins.get(pluginId);
            if (plugin && !this.enabledPlugins.has(pluginId)) {
                this.enabledPlugins.add(pluginId);
                this.saveState();
                this.startPlugin(plugin);
            }
        }

        disable(pluginId) {
            const plugin = this.plugins.get(pluginId);
            if (plugin && this.enabledPlugins.has(pluginId)) {
                this.enabledPlugins.delete(pluginId);
                this.saveState();
                this.stopPlugin(plugin);
            }
        }

        startPlugin(plugin) {
            try {
                if (typeof plugin.onStart === "function") {
                    plugin.onStart();
                }
                console.log(`[Yap++] Started plugin: ${plugin.name}`);
            } catch (e) {
                console.error(`[Yap++] Error starting plugin ${plugin.name}:`, e);
            }
        }

        stopPlugin(plugin) {
            try {
                if (typeof plugin.onStop === "function") {
                    plugin.onStop();
                }
                console.log(`[Yap++] Stopped plugin: ${plugin.name}`);
            } catch (e) {
                console.error(`[Yap++] Error stopping plugin ${plugin.name}:`, e);
            }
        }
    }

    window.YapPlusPlus = {
        Host: new PluginHost()
    };

    // Global Network Interception Hooks
    const originalFetch = window.fetch;
    const fetchInterceptors = [];

    window.fetch = async function (...args) {
        let [resource, config] = args;
        for (const interceptor of fetchInterceptors) {
            try {
                const modified = interceptor(resource, config);
                if (modified) {
                    resource = modified.resource || resource;
                    config = modified.config || config;
                }
            } catch (e) {
                console.error("[Yap++] Fetch interceptor error:", e);
            }
        }
        return originalFetch.call(this, resource, config);
    };

    window.YapPlusPlus.addFetchInterceptor = (fn) => fetchInterceptors.push(fn);

    // ==========================================
    // 2. Part 1 Plugins
    // ==========================================

    // 1. Silent Typing (notyping)
    window.YapPlusPlus.Host.register({
        id: "notyping",
        name: "Silent Typing",
        description: "Swallows WebSocket typing frames to hide typing status.",
        originalSend: null,
        onStart() {
            if (window.WebSocket && !this.originalSend) {
                this.originalSend = window.WebSocket.prototype.send;
                const self = this;
                window.WebSocket.prototype.send = function (data) {
                    if (typeof data === "string" && data.includes('"type":"typing"')) {
                        return; // Swallow typing frame
                    }
                    return self.originalSend.apply(this, arguments);
                };
            }
        },
        onStop() {
            if (this.originalSend) {
                window.WebSocket.prototype.send = this.originalSend;
                this.originalSend = null;
            }
        }
    });

    // 2. SIXSEVEN
    window.YapPlusPlus.Host.register({
        id: "sixseven",
        name: "SIXSEVEN",
        description: "Appends 67 to sent message content.",
        interceptor: null,
        onStart() {
            this.interceptor = (resource, config) => {
                if (typeof resource === "string" && resource.includes("/rest/v1/messages") && config && config.method === "POST") {
                    try {
                        let body = JSON.parse(config.body);
                        if (body.content) {
                            body.content += " 67";
                            config.body = JSON.stringify(body);
                        }
                    } catch (e) {}
                }
                return { resource, config };
            };
            window.YapPlusPlus.addFetchInterceptor(this.interceptor);
        },
        onStop() {
            const idx = fetchInterceptors.indexOf(this.interceptor);
            if (idx > -1) fetchInterceptors.splice(idx, 1);
        }
    });

    // 3. imasigma
    window.YapPlusPlus.Host.register({
        id: "imasigma",
        name: "I'm a Sigma",
        description: "Appends '\\n* (I'm a sigma)' to sent messages.",
        interceptor: null,
        onStart() {
            this.interceptor = (resource, config) => {
                if (typeof resource === "string" && resource.includes("/rest/v1/messages") && config && config.method === "POST") {
                    try {
                        let body = JSON.parse(config.body);
                        if (body.content) {
                            body.content += "\n* (I'm a sigma)";
                            config.body = JSON.stringify(body);
                        }
                    } catch (e) {}
                }
                return { resource, config };
            };
            window.YapPlusPlus.addFetchInterceptor(this.interceptor);
        },
        onStop() {
            const idx = fetchInterceptors.indexOf(this.interceptor);
            if (idx > -1) fetchInterceptors.splice(idx, 1);
        }
    });

    // 4. funcommands (Commented Draft)
    /*
    window.YapPlusPlus.Host.register({
        id: "funcommands",
        name: "Fun Commands",
        description: "Custom command parser (y/test, y/userid, y/attention, y/btw).",
        onStart() {
            // TODO: Hook into chat input line / send event to evaluate 'y/' prefixes.
        },
        onStop() {}
    });
    */

    // 5. Message Logger (messagelogger)
    window.YapPlusPlus.Host.register({
        id: "messagelogger",
        name: "Message Logger",
        description: "Logs deleted/edited messages and paints ghost messages in red.",
        cache: new Map(),
        interceptor: null,
        onStart() {
            this.interceptor = (resource, config) => {
                if (typeof resource === "string" && resource.includes("/rest/v1/messages")) {
                    if (config && config.method === "DELETE") {
                        console.log("[MessageLogger] Message deletion detected:", resource);
                    }
                }
                return { resource, config };
            };
            window.YapPlusPlus.addFetchInterceptor(this.interceptor);
        },
        onStop() {
            const idx = fetchInterceptors.indexOf(this.interceptor);
            if (idx > -1) fetchInterceptors.splice(idx, 1);
        }
    });

    // ==========================================
    // 3. Test Client GUI Overlay
    // ==========================================
    function renderTestClientUI() {
        const existingUI = document.getElementById("yap-test-client-ui");
        if (existingUI) existingUI.remove();

        const container = document.createElement("div");
        container.id = "yap-test-client-ui";
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: #1e1f22;
            color: #f2f3f5;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            font-family: sans-serif;
            width: 320px;
            border: 1px solid #2b2d31;
        `;

        const title = document.createElement("div");
        title.style.cssText = "font-weight: bold; font-size: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;";
        title.innerHTML = `<span>Yap++ Test Client</span> <span style="font-size: 10px; background: #5865f2; padding: 2px 6px; border-radius: 4px;">v1.0.0</span>`;
        container.appendChild(title);

        // Toggle Switch (Enable/Disable Client)
        const switchWrapper = document.createElement("label");
        switchWrapper.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: pointer; font-size: 14px;";
        switchWrapper.innerHTML = `
            <span>Enable Client Core</span>
            <input type="checkbox" id="yappp-toggle" ${localStorage.getItem("yap_enabled") !== "false" ? "checked" : ""} style="cursor: pointer; width: 18px; height: 18px; accent-color: #5865f2;">
        `;
        container.appendChild(switchWrapper);

        const toggleInput = switchWrapper.querySelector("#yappp-toggle");
        toggleInput.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            localStorage.setItem("yap_enabled", isEnabled);
            console.log(`[Yap++] Client state set to: ${isEnabled}`);
        });

        // Script Endpoint Text Box
        const label = document.createElement("div");
        label.style.cssText = "font-size: 12px; color: #b5bac1; margin-bottom: 4px;";
        label.innerText = "GitHub Client URL:";
        container.appendChild(label);

        const urlInput = document.createElement("input");
        urlInput.type = "text";
        urlInput.value = localStorage.getItem("yap_client_url") || "https://cb-1829.github.io/yap-plus-plus/testclient.js";
        urlInput.style.cssText = "width: 100%; box-sizing: border-box; background: #313338; color: #fff; border: 1px solid #111214; padding: 8px; border-radius: 6px; margin-bottom: 12px; font-size: 12px;";
        container.appendChild(urlInput);

        // Update Button
        const updateBtn = document.createElement("button");
        updateBtn.innerText = "Update / Reload Client";
        updateBtn.style.cssText = "width: 100%; background: #5865f2; color: #fff; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;";
        updateBtn.onmouseover = () => updateBtn.style.background = "#4752c4";
        updateBtn.onmouseout = () => updateBtn.style.background = "#5865f2";

        updateBtn.addEventListener("click", () => {
            const targetUrl = urlInput.value.trim();
            localStorage.setItem("yap_client_url", targetUrl);
            updateBtn.innerText = "Downloading Update...";
            updateBtn.disabled = true;

            const fetchUrl = targetUrl + "?v=" + Date.now();
            fetch(fetchUrl)
                .then(res => {
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    return res.text();
                })
                .then(code => {
                    eval(code);
                    updateBtn.innerText = "Updated Successfully!";
                    setTimeout(() => {
                        updateBtn.innerText = "Update / Reload Client";
                        updateBtn.disabled = false;
                    }, 2000);
                })
                .catch(err => {
                    console.error("[Yap++] Update failed:", err);
                    updateBtn.innerText = "Update Failed";
                    updateBtn.style.background = "#da373c";
                    setTimeout(() => {
                        updateBtn.innerText = "Update / Reload Client";
                        updateBtn.style.background = "#5865f2";
                        updateBtn.disabled = false;
                    }, 2000);
                });
        });

        container.appendChild(updateBtn);
        document.body.appendChild(container);
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        renderTestClientUI();
    } else {
        window.addEventListener("DOMContentLoaded", renderTestClientUI);
    }

    console.log("[Yap++] Initialization complete.");
})();
